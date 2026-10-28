'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Props = {
  classicContent: ReactNode;
  reportContent: ReactNode;
  className?: string;
  defaultTab?: 'classic' | 'report';
};

export default function PayoutBreakdownTabs({
  classicContent,
  reportContent,
  className = 'mb-4',
  defaultTab = 'classic',
}: Props) {
  return (
    <Tabs defaultValue={defaultTab} className={className}>
      <TabsList
        variant="line"
        className="mb-4 w-full justify-start border-b border-[#e2e8f0] bg-transparent p-0 dark:border-slate-700"
      >
        <TabsTrigger
          value="classic"
          className="rounded-none px-4 py-2 text-[13px] font-bold data-active:text-[#2563eb]"
        >
          Classic
        </TabsTrigger>
        <TabsTrigger
          value="report"
          className="rounded-none px-4 py-2 text-[13px] font-bold data-active:text-[#2563eb]"
        >
          Financial Report
        </TabsTrigger>
      </TabsList>
      <TabsContent value="classic" className="mt-0 outline-none">
        {classicContent}
      </TabsContent>
      <TabsContent value="report" className="mt-0 outline-none">
        {reportContent}
      </TabsContent>
    </Tabs>
  );
}
