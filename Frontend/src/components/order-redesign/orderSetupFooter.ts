import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';
import type { AddressSelection } from '@/components/order/AddressMapPicker';
import type { OrderMode } from '@/store/cartStore';
import type { DeliveryBranchOption, Store as StoreType } from '@/types';

export type OrderSetupFooterState = {
  hint: string;
  hintBold?: string;
  mode?: OrderMode;
  disabled: boolean;
  onConfirm: () => void;
};

export function buildOrderSetupFooterState(input: {
  mode: OrderMode;
  validating: boolean;
  selectedDeliveryStoreId: string | null;
  addressSelection: AddressSelection | null;
  suggestedDeliveryBranches: DeliveryBranchOption[];
  selectedStore: StoreType | null;
  onConfirmDelivery: () => void;
  onConfirmTakeaway: () => void;
}): OrderSetupFooterState {
  const {
    mode,
    validating,
    selectedDeliveryStoreId,
    addressSelection,
    suggestedDeliveryBranches,
    selectedStore,
    onConfirmDelivery,
    onConfirmTakeaway,
  } = input;

  if (mode === 'DELIVERY') {
    const branch = suggestedDeliveryBranches.find((b) => b.id === selectedDeliveryStoreId);
    return {
      hint: branch
        ? 'Delivering from'
        : addressSelection
          ? 'Choose a suggested branch'
          : orderSetupCopy.hintBranch,
      hintBold: branch?.name,
      mode: 'DELIVERY',
      disabled: validating || !selectedDeliveryStoreId || !addressSelection,
      onConfirm: onConfirmDelivery,
    };
  }

  return {
    hint: selectedStore ? 'Pickup from' : orderSetupCopy.hintBranch,
    hintBold: selectedStore?.name,
    mode: 'TAKEAWAY',
    disabled: !selectedStore,
    onConfirm: onConfirmTakeaway,
  };
}
