const fs = require('fs');

const files = [
  'd:/DARTCODES_next_Project/bingchun/bingchun-delivery/frontend/src/components/admin/WalletWithdrawalModal.tsx',
  'd:/DARTCODES_next_Project/bingchun/bingchun-delivery/frontend/src/components/admin/ApprovePayoutBreakdown.tsx',
  'd:/DARTCODES_next_Project/bingchun/bingchun-delivery/frontend/src/components/admin/PeriodPayoutSplitCards.tsx'
];

const replacements = [
  { regex: /(?<![:a-zA-Z0-9\-])bg-white/g, replace: "bg-white dark:bg-slate-900" },
  { regex: /(?<![:a-zA-Z0-9\-])bg-\[#f8fafc\]/g, replace: "bg-[#f8fafc] dark:bg-slate-800" },
  { regex: /(?<![:a-zA-Z0-9\-])bg-\[#eff6ff\]/g, replace: "bg-[#eff6ff] dark:bg-blue-900/30" },
  { regex: /(?<![:a-zA-Z0-9\-])bg-\[#fef2f2\]/g, replace: "bg-[#fef2f2] dark:bg-red-900/20" },
  { regex: /(?<![:a-zA-Z0-9\-])bg-\[#ecfdf5\]/g, replace: "bg-[#ecfdf5] dark:bg-emerald-900/20" },
  
  { regex: /(?<![:a-zA-Z0-9\-])hover:bg-\[#f8fafc\]/g, replace: "hover:bg-[#f8fafc] dark:hover:bg-slate-800" },
  { regex: /(?<![:a-zA-Z0-9\-])hover:bg-\[#f1f5f9\]/g, replace: "hover:bg-[#f1f5f9] dark:hover:bg-slate-800" },
  
  { regex: /(?<![:a-zA-Z0-9\-])text-\[#1e293b\]/g, replace: "text-[#1e293b] dark:text-slate-100" },
  { regex: /(?<![:a-zA-Z0-9\-])hover:text-\[#1e293b\]/g, replace: "hover:text-[#1e293b] dark:hover:text-slate-100" },
  { regex: /(?<![:a-zA-Z0-9\-])text-\[#64748b\]/g, replace: "text-[#64748b] dark:text-slate-400" },
  { regex: /(?<![:a-zA-Z0-9\-])text-\[#94a3b8\]/g, replace: "text-[#94a3b8] dark:text-slate-500" },
  { regex: /(?<![:a-zA-Z0-9\-])text-\[#475569\]/g, replace: "text-[#475569] dark:text-slate-300" },
  
  { regex: /(?<![:a-zA-Z0-9\-])border-\[#e2e8f0\]/g, replace: "border-[#e2e8f0] dark:border-slate-700" },
  { regex: /(?<![:a-zA-Z0-9\-])border-\[#cbd5e1\]/g, replace: "border-[#cbd5e1] dark:border-slate-600" },
  { regex: /(?<![:a-zA-Z0-9\-])hover:border-\[#cbd5e1\]/g, replace: "hover:border-[#cbd5e1] dark:hover:border-slate-600" },
  { regex: /(?<![:a-zA-Z0-9\-])border-red-200/g, replace: "border-red-200 dark:border-red-900/50" },
  { regex: /(?<![:a-zA-Z0-9\-])border-emerald-200/g, replace: "border-emerald-200 dark:border-emerald-900/50" },
  
  { regex: /(?<![:a-zA-Z0-9\-])divide-\[#e2e8f0\]/g, replace: "divide-[#e2e8f0] dark:divide-slate-700" },
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  replacements.forEach(({regex, replace}) => {
    content = content.replace(regex, replace);
  });
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
