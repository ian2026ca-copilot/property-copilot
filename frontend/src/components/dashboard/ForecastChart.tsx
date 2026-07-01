"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface DataPoint {
  month: string;
  occupancy: number;
  revenue: number;
}

const formatRevenue = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

export default function ForecastChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="occ"
          domain={([min]: [number]) => [Math.max(0, Math.floor(min / 10) * 10), 100]}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={36}
        />
        <YAxis
          yAxisId="rev"
          orientation="right"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatRevenue}
          width={44}
        />
        <Tooltip
          formatter={(value, name) =>
            name === "revenue" ? [`$${Number(value).toLocaleString()}`, "Revenue"] : [`${value}%`, "Occupancy"]
          }
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line yAxisId="occ" type="monotone" dataKey="occupancy" stroke="#000" strokeWidth={2} dot={{ r: 3 }} name="Occupancy" />
        <Line yAxisId="rev" type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="Revenue" />
      </LineChart>
    </ResponsiveContainer>
  );
}
