"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">PC</div>
            <span className="text-xl font-semibold text-slate-900">Property Copilot</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Forgot password</CardTitle>
            <CardDescription>Enter your email and we'll send you a reset link</CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-slate-700 font-medium">Check your email</p>
                <p className="text-sm text-slate-500">
                  If <span className="font-medium text-slate-700">{email}</span> is registered, a password reset link has been sent. It expires in 1 hour.
                </p>
                <Link href="/login" className="block text-sm text-blue-600 hover:underline font-medium mt-2">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
                <p className="text-center text-sm text-slate-500">
                  <Link href="/login" className="text-blue-600 hover:underline font-medium">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
