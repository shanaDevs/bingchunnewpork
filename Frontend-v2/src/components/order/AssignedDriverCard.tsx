'use client';

import { Bike, Phone, User } from 'lucide-react';
import type { Order } from '@/types';

type AssignedDriver = NonNullable<Order['assignedDriver']>;

function vehicleLabel(driver: AssignedDriver): string {
  return [driver.vehicleColor, driver.vehicleType, driver.vehicleNumber]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' · ');
}

export default function AssignedDriverCard({ driver }: { driver: AssignedDriver }) {
  const vehicle = vehicleLabel(driver);

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
        <Bike size={16} className="text-brand" />
        Your rider
      </h3>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          {driver.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={driver.profilePhotoUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <User size={20} />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-white truncate">{driver.name}</p>
          {vehicle ? (
            <p className="text-sm text-muted">{vehicle}</p>
          ) : (
            <p className="text-sm text-muted">Vehicle details coming soon</p>
          )}
          {driver.phone ? (
            <a
              href={`tel:${driver.phone}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <Phone size={14} />
              {driver.phone}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
