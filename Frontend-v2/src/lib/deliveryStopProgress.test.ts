import { describe, expect, it } from 'vitest';
import {
  deriveBranchStartState,
  deriveReturnState,
  deriveStepStates,
  deriveTargetRiderNodeIndex,
  deriveUpcomingNodeIndex,
  lastCompletedStopSequence,
  segmentColorBetweenNodes,
  segmentColorToStop,
  type WizardStopOrder,
} from './deliveryStopProgress';

function stop(
  sequence: number,
  deliveryState: WizardStopOrder['deliveryState'] = 'Pending',
): WizardStopOrder {
  return {
    orderId: `order-${sequence}`,
    orderNumber: `BC260829-${4300 + sequence}`,
    sequence,
    status: deliveryState === 'Delivered' ? 'DELIVERED' : 'OUT_FOR_DELIVERY',
    deliveryState,
  };
}

const threeStops = [stop(1), stop(2), stop(3)];

describe('deriveBranchStartState', () => {
  it('is pending before Confirm Pickup', () => {
    expect(deriveBranchStartState(false, 'ASSIGNED')).toBe('pending');
  });

  it('is completed after Confirm Pickup while still ASSIGNED', () => {
    expect(deriveBranchStartState(true, 'ASSIGNED')).toBe('completed');
  });
});

describe('deriveStepStates', () => {
  it('keeps all stops pending after Start Delivery until Mark as Delivered', () => {
    expect(deriveStepStates(threeStops, 'IN_PROGRESS')).toEqual([
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('marks a stop completed only after delivery is confirmed', () => {
    const orders = [stop(1, 'Delivered'), stop(2), stop(3)];
    expect(deriveStepStates(orders, 'IN_PROGRESS')).toEqual([
      'completed',
      'pending',
      'pending',
    ]);
  });

  it('treats order.status DELIVERED as completed even if deliveryState is still Pending', () => {
    const orders: WizardStopOrder[] = [
      { ...stop(1), status: 'DELIVERED', deliveryState: 'Pending' },
      stop(2),
      stop(3),
    ];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(stopStates).toEqual(['completed', 'pending', 'pending']);
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(1);
  });
});

describe('deriveReturnState', () => {
  it('stays pending while the rider is delivering or returning', () => {
    expect(deriveReturnState('IN_PROGRESS')).toBe('pending');
    expect(deriveReturnState('RETURNING')).toBe('pending');
  });

  it('is completed only after Return to Branch finishes the job', () => {
    expect(deriveReturnState('COMPLETED')).toBe('completed');
  });
});

describe('deriveTargetRiderNodeIndex', () => {
  it('keeps the rider at branch after Start Delivery with no deliveries yet', () => {
    const stopStates = deriveStepStates(threeStops, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, threeStops)).toBe(0);
  });

  it('moves the rider to the last completed stop', () => {
    const orders = [stop(1, 'Delivered'), stop(2, 'Delivered'), stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(2);
  });

  it('moves the highlight onto a rider-failed stop as well', () => {
    const orders = [stop(1, 'Delivered'), stop(2, 'Failed'), stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(stopStates).toEqual(['completed', 'failed', 'pending']);
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(2);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(3);
  });

  it('sits between last reached stop and a mid-route vehicle failure', () => {
    const failedEnRoute: WizardStopOrder = {
      ...stop(2, 'Failed'),
      failureOutcome: 'VEHICLE_FAILURE',
    };
    const orders = [stop(1, 'Delivered'), failedEnRoute, stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(stopStates).toEqual(['completed', 'pending', 'pending']);
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(1.5);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(2);
    expect(lastCompletedStopSequence(orders, stopStates)).toBe(1);
  });

  it('sits between branch and the first stop when the vehicle fails before any delivery', () => {
    const failedEnRoute: WizardStopOrder = {
      ...stop(1, 'Failed'),
      failureOutcome: 'VEHICLE_FAILURE',
    };
    const orders = [failedEnRoute, stop(2), stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(0.5);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(1);
  });

  it('skips a cancelled future stop and stays on the current stop until the next real stop is delivered', () => {
    const cancelledStop: WizardStopOrder = {
      ...stop(2),
      status: 'CANCELLED',
      deliveryState: 'Pending',
    };
    let orders = [stop(1, 'Delivered'), cancelledStop, stop(3)];
    let stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(stopStates).toEqual(['completed', 'failed', 'pending']);
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(1);
    expect(lastCompletedStopSequence(orders, stopStates)).toBe(1);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(3);

    orders = [stop(1, 'Delivered'), cancelledStop, stop(3, 'Delivered')];
    stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(stopStates).toEqual(['completed', 'failed', 'completed']);
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(3);
    expect(lastCompletedStopSequence(orders, stopStates)).toBe(3);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(4);
  });

  it('stays on the last stop while returning to branch', () => {
    const allDelivered = threeStops.map((order) => ({
      ...order,
      deliveryState: 'Delivered' as const,
    }));
    const stopStates = deriveStepStates(allDelivered, 'RETURNING');
    expect(deriveTargetRiderNodeIndex('RETURNING', stopStates, allDelivered)).toBe(3);
  });

  it('lands on Return once the job is completed', () => {
    const allDelivered = threeStops.map((order) => ({
      ...order,
      deliveryState: 'Delivered' as const,
    }));
    const stopStates = deriveStepStates(allDelivered, 'COMPLETED');
    expect(deriveTargetRiderNodeIndex('COMPLETED', stopStates, allDelivered)).toBe(4);
  });
});

describe('deriveUpcomingNodeIndex', () => {
  it('pulses the next pending stop after the last reached stop', () => {
    const orders = [stop(1, 'Delivered'), stop(2), stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(1);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(2);
  });

  it('skips cancelled stops when choosing the node to pulse', () => {
    const cancelledStop: WizardStopOrder = {
      ...stop(2),
      status: 'CANCELLED',
      deliveryState: 'Pending',
    };
    const orders = [stop(1, 'Delivered'), cancelledStop, stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(1);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(3);
  });

  it('pulses Return when the next destination is the store', () => {
    const orders = threeStops.map((order) => ({
      ...order,
      deliveryState: 'Delivered' as const,
    }));
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(3);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(4);
    expect(deriveUpcomingNodeIndex('RETURNING', stopStates, orders)).toBe(4);
    expect(deriveUpcomingNodeIndex('COMPLETED', stopStates, orders)).toBeNull();
  });

  it('pulses Return when remaining stops are cancelled', () => {
    const cancelledStop: WizardStopOrder = {
      ...stop(2),
      status: 'CANCELLED',
      deliveryState: 'Pending',
    };
    const orders = [stop(1, 'Delivered'), cancelledStop];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(1);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(3);
  });

  it('pulses the first real pending stop while the rider is still at branch', () => {
    const cancelledFirst: WizardStopOrder = {
      ...stop(1),
      status: 'CANCELLED',
      deliveryState: 'Pending',
    };
    const orders = [cancelledFirst, stop(2), stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(deriveTargetRiderNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(0);
    expect(deriveUpcomingNodeIndex('IN_PROGRESS', stopStates, orders)).toBe(2);
  });
});

describe('segmentColorBetweenNodes', () => {
  it('keeps connectors grey until the destination node is completed', () => {
    expect(segmentColorBetweenNodes('pending')).toBe('bg-slate-200 dark:bg-navy-border');
    expect(segmentColorBetweenNodes('completed')).toBe('bg-brand');
  });
});

describe('segmentColorToStop', () => {
  it('keeps the inbound line grey for an unreached cancelled skip', () => {
    const cancelledStop: WizardStopOrder = {
      ...stop(2),
      status: 'CANCELLED',
      deliveryState: 'Pending',
    };
    const orders = [stop(1, 'Delivered'), cancelledStop, stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(segmentColorToStop(1, stopStates[1], orders, stopStates)).toBe(
      'bg-slate-200 dark:bg-navy-border',
    );
  });

  it('fills the inbound line to a cancelled skip after a later stop is reached', () => {
    const cancelledStop: WizardStopOrder = {
      ...stop(2),
      status: 'CANCELLED',
      deliveryState: 'Pending',
    };
    const orders = [stop(1, 'Delivered'), cancelledStop, stop(3, 'Delivered')];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(segmentColorToStop(1, stopStates[1], orders, stopStates)).toBe('bg-red-500/60');
    expect(segmentColorToStop(2, stopStates[2], orders, stopStates)).toBe('bg-brand');
  });

  it('keeps the inbound line grey for a vehicle-failure stop the rider never reached', () => {
    const failedEnRoute: WizardStopOrder = {
      ...stop(2, 'Failed'),
      failureOutcome: 'VEHICLE_FAILURE',
    };
    const orders = [stop(1, 'Delivered'), failedEnRoute, stop(3)];
    const stopStates = deriveStepStates(orders, 'IN_PROGRESS');
    expect(segmentColorToStop(1, stopStates[1], orders, stopStates)).toBe(
      'bg-slate-200 dark:bg-navy-border',
    );
  });
});

describe('full delivery sequence', () => {
  it('follows Branch → delivered stops → Return on job complete', () => {
    let pickedUp = false;
    let jobStatus = 'ASSIGNED';
    let orders = threeStops;

    // Confirm pickup
    pickedUp = true;
    expect(deriveBranchStartState(pickedUp, jobStatus)).toBe('completed');

    // Start delivery — stops stay pending, rider at branch
    jobStatus = 'IN_PROGRESS';
    let stopStates = deriveStepStates(orders, jobStatus);
    expect(stopStates).toEqual(['pending', 'pending', 'pending']);
    expect(deriveTargetRiderNodeIndex(jobStatus, stopStates, orders)).toBe(0);
    expect(deriveUpcomingNodeIndex(jobStatus, stopStates, orders)).toBe(1);
    expect(segmentColorBetweenNodes(stopStates[0])).toBe('bg-slate-200 dark:bg-navy-border');

    // Deliver stop 1
    orders = [stop(1, 'Delivered'), stop(2), stop(3)];
    stopStates = deriveStepStates(orders, jobStatus);
    expect(stopStates).toEqual(['completed', 'pending', 'pending']);
    expect(deriveTargetRiderNodeIndex(jobStatus, stopStates, orders)).toBe(1);
    expect(deriveUpcomingNodeIndex(jobStatus, stopStates, orders)).toBe(2);
    expect(segmentColorBetweenNodes('completed')).toBe('bg-brand');
    expect(deriveReturnState(jobStatus)).toBe('pending');

    // Deliver final stop — timeline stays on final stop; Return blinks
    orders = threeStops.map((order) => ({ ...order, deliveryState: 'Delivered' as const }));
    stopStates = deriveStepStates(orders, jobStatus);
    expect(lastCompletedStopSequence(orders, stopStates)).toBe(3);
    expect(deriveTargetRiderNodeIndex(jobStatus, stopStates, orders)).toBe(3);
    expect(deriveUpcomingNodeIndex(jobStatus, stopStates, orders)).toBe(4);
    expect(deriveReturnState(jobStatus)).toBe('pending');

    // Returning to branch — still on the last stop; Return keeps blinking until complete
    jobStatus = 'RETURNING';
    expect(deriveTargetRiderNodeIndex(jobStatus, stopStates, orders)).toBe(3);
    expect(deriveUpcomingNodeIndex(jobStatus, stopStates, orders)).toBe(4);
    expect(deriveReturnState(jobStatus)).toBe('pending');

    // Rider completes the job inside the branch radius
    jobStatus = 'COMPLETED';
    expect(deriveReturnState(jobStatus)).toBe('completed');
    expect(deriveTargetRiderNodeIndex(jobStatus, stopStates, orders)).toBe(4);
    expect(deriveUpcomingNodeIndex(jobStatus, stopStates, orders)).toBeNull();
    expect(segmentColorBetweenNodes('completed')).toBe('bg-brand');
  });
});
