"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  occupancyPct: number;
  overdueCount: number;
  totalLeases: number;
}

export default function RiskDonut({ occupancyPct, overdueCount, totalLeases }: Props) {
  const overdueRate = totalLeases > 0 ? Math.round((overdueCount / totalLeases) * 100) : 0;
  const vacancyRate = 100 - occupancyPct;
  const healthy = Math.max(0, 100 - overdueRate - Math.min(vacancyRate, 30));
  const riskScore = Math.round(overdueRate * 2 + vacancyRate * 0.5);

  const data = [
    { name: "Healthy", value: healthy, color: "#22c55e" },
    { name: "Vacancy", value: Math.min(vacancyRate, 30), color: "#f59e0b" },
    { name: "Overdue", value: overdueRate, color: "#ef4444" },
  ].filter(d => d.value > 0);

  if (data.length === 0) {
    data.push({ name: "Healthy", value: 100, color: "#22c55e" });
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex flex-col items-center -mt-[120px] mb-[60px] pointer-events-none">
        <span className="text-2xl font-bold text-slate-900">{riskScore}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide">Risk score</span>
      </div>

      <div className="space-y-1.5 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-slate-600">{d.name}</span>
            </div>
            <span className="font-medium text-slate-900">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
