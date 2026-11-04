import type { Metadata } from 'next';
import { AddressesView } from '@/components/account-redesign/addresses/AddressesView';

export const metadata: Metadata = {
  title: 'My Addresses',
  robots: { index: false },
};

/** Saved delivery addresses (components/account-redesign/addresses); the account layout puts it in the AccountShell. */
export default function AddressesPage() {
  return <AddressesView />;
}
