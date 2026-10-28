import DeliveryShell from '@/components/layout/DeliveryShell';

export const dynamic = 'force-dynamic';

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <DeliveryShell>{children}</DeliveryShell>;
}
