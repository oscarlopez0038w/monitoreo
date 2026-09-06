'use client';

import AppLayout from '@/components/AppLayout';
import AbandonedCartsPanel from '@/components/AbandonedCartsPanel';

export default function MasterDataPage() {
  return (
    <AppLayout>
      <AbandonedCartsPanel />
    </AppLayout>
  );
}
