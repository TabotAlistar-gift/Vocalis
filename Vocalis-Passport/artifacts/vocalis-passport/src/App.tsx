import { useEffect, useMemo, useState, useRef } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  ArrowRight, BarChart3, Check, ChevronRight, CircleAlert,
  Download, FileBadge, ImagePlus, LayoutDashboard, LogOut,
  Menu, Pencil, Search, ShieldCheck, Sparkles, UserRound, Users, X,
  Share2, Award, CheckCircle2, RefreshCw, Eye, AlertTriangle, Trash2
} from 'lucide-react';
import {
  StudentProfile, AdminStudent, Passport,
  getHealthCheckQueryKey, getGetStudentDashboardQueryKey, getGetStudentPassportQueryKey,
  getGetStudentProfileQueryKey, getGetAdminStudentQueryKey, getListAdminStudentsQueryKey,
  getDownloadStudentPassportPdfQueryKey, getDownloadAdminStudentPassportPdfQueryKey,
  useGetCurrentUser, useGetStudentDashboard, useGetStudentProfile, useUpdateStudentProfile,
  useUploadStudentPhoto, useGetStudentPassport, useGenerateStudentPassport,
  useDownloadStudentPassportPdf, useListAdminStudents, useGetAdminStudent,
  useUpdateAdminStudent, useGenerateAdminStudentPassport, useDownloadAdminStudentPassportPdf,
  useDeactivateAdminStudent, useLogin, useRegister, useLogout, useHealthCheck, useRequestPasswordReset,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkPubKey = rawClerkKey && (rawClerkKey.startsWith('pk_test_') || rawClerkKey.startsWith('pk_live_')) ? rawClerkKey : null;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const levels = ['Level One', 'Level Two', 'Level Three', 'Level Four', 'Level Five', 'Level Six'];
const badges = ['Explorer', 'Learner', 'Builder', 'Collaborator', 'Leader', 'Global Citizen', 'Changemaker'];

const levelToBadgeMap: Record<string, string> = {
  'Level One': 'Explorer',
  'Level Two': 'Learner',
  'Level Three': 'Builder',
  'Level Four': 'Collaborator',
  'Level Five': 'Leader',
  'Level Six': 'Global Citizen',
};

function initials(name?: string) {
  return (name || 'Vocalis Student').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function errorText(error: unknown) {
  if (!error) return 'Something went wrong. Please try again.';
  // ApiError from custom-fetch has .data with parsed JSON body and .message with formatted text
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    // Check .data.error (our API returns { error: "..." })
    if (e.data && typeof e.data === 'object') {
      const data = e.data as Record<string, unknown>;
      if (typeof data.error === 'string') return data.error;
      if (typeof data.message === 'string') return data.message;
    }
    // Fall back to .message which ApiError sets automatically
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return 'Something went wrong. Please try again.';
}

function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-2.5 transition-opacity hover:opacity-90 shrink-0', className)} data-testid="link-logo">
      <img src="/vocalist logo.png" alt="Vocalis Logo" className="h-7 w-auto sm:h-8 object-contain" />
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <span className={cn("font-display text-lg sm:text-xl font-bold tracking-tight", dark ? "text-white" : "text-[#0e2347]")}>Vocalis</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#165de8]" />
        </div>
        <span className={cn("text-[8px] sm:text-[9px] font-semibold uppercase tracking-[0.14em]", dark ? "text-[#f4c641]" : "text-[#52617a]")}>Passport</span>
      </div>
    </Link>
  );
}

function Avatar({ profile, size = 'md' }: { profile?: Partial<StudentProfile> | Partial<AdminStudent> | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizeClass = {
    sm: 'h-9 w-9 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-16 w-16 text-lg',
    xl: 'h-24 w-24 text-2xl',
  }[size];

  return profile?.profilePhotoUrl ? (
    <img src={profile.profilePhotoUrl} alt={profile.fullName || 'Student portrait'} className={cn(sizeClass, 'rounded-2xl object-cover ring-2 ring-white/80 shadow-md')} data-testid="img-profile-avatar" />
  ) : (
    <div className={cn(sizeClass, 'flex items-center justify-center rounded-2xl bg-gradient-to-br from-[#ed1d40] via-[#8527a5] to-[#165de8] font-display font-bold text-white ring-2 ring-white/80 shadow-md')} data-testid="avatar-fallback">
      {initials(profile?.fullName)}
    </div>
  );
}

function LoadingState({ label = 'Loading your passport' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4" data-testid="loading-state">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#eef3ff]">
        <div className="absolute h-full w-full animate-spin rounded-full border-3 border-transparent border-t-[#165de8]" />
        <Sparkles className="h-6 w-6 text-[#165de8]" />
      </div>
      <p className="text-center font-display text-sm font-medium text-muted-foreground">{label}...</p>
    </div>
  );
}

function ErrorState({ error, retry }: { error?: unknown; retry?: () => void }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center" data-testid="error-state">
      <CircleAlert className="mb-3 h-9 w-9 text-destructive animate-pulse" />
      <h3 className="font-display text-lg font-bold text-[#0e2347]">We could not load this view</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{errorText(error)}</p>
      {retry && <Button onClick={retry} variant="outline" className="mt-5 rounded-xl border-[#d8e1ec] font-semibold" data-testid="button-retry"><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>}
    </div>
  );
}

function StatusPill({ status }: { status?: string | null }) {
  const active = status === 'active';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase', active ? 'bg-[#dff6e9] text-[#197044]' : 'bg-[#fff3d4] text-[#8d6614]')} data-testid={`status-passport-${status || 'draft'}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-[#197044]" : "bg-[#8d6614]")} />
      {active ? 'Active' : 'Draft'}
    </span>
  );
}

function PublicNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3.5 sm:px-6 sm:py-5 lg:px-8">
        <Logo />
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/sign-in" className="whitespace-nowrap rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#0e2347] transition-colors hover:bg-white/60 sm:px-4 sm:py-2 sm:text-sm" data-testid="link-sign-in">
            Sign in
          </Link>
          <Link href="/sign-up" className="button-primary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-bold shadow-md transition-transform active:scale-95 whitespace-nowrap sm:px-5 sm:py-2.5 sm:text-sm sm:gap-2" data-testid="link-sign-up">
            <span>Create Passport</span> <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

function LandingPage() {
  const { data: user, isLoading } = useGetCurrentUser();
  const { data: health } = useHealthCheck({ query: { staleTime: 60000, queryKey: getHealthCheckQueryKey() } });

  if (!isLoading && user) {
    if (user.role === 'admin') return <Redirect to="/admin" />;
    return <Redirect to="/dashboard" />;
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#f5f8fc]" data-testid="page-landing">
      <PublicNav />
      <section className="relative mx-auto grid min-h-[760px] max-w-7xl items-center gap-12 px-5 pb-20 pt-32 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:pt-28">
        <div className="absolute -left-32 top-28 h-80 w-80 rounded-full bg-[#dbeaff] blur-3xl opacity-70" />
        <div className="relative z-10 max-w-2xl animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#165de8]/20 bg-[#165de8]/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#165de8]">
            <Sparkles className="h-3.5 w-3.5 text-[#f4c641]" /> Official Student Credential
          </div>
          <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-[#0e2347] sm:text-6xl lg:text-[5.2rem]">
            Turning passion<br />
            <span className="bg-gradient-to-r from-[#ed1d40] via-[#8527a5] to-[#165de8] bg-clip-text text-transparent">into impact.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#52617a] sm:text-lg sm:leading-8">
            Vocalis Passport is your official digital record of growth, leadership, and community impact. Carry your achievements anywhere in the world.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <Link href="/sign-up" className="button-primary inline-flex items-center gap-2.5 px-6 py-3.5 text-base font-bold shadow-lg transition-transform active:scale-95" data-testid="link-hero-sign-up">
              Create Your Passport <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/sign-in" className="inline-flex items-center justify-center rounded-xl border border-[#d8e1ec] bg-white px-5 py-3.5 text-sm font-bold text-[#0e2347] shadow-sm transition-colors hover:bg-[#f8fafc]" data-testid="link-hero-sign-in">
              Member Sign In
            </Link>
          </div>
          <div className="mt-12 flex items-center gap-6 border-t border-[#d8e1ec] pt-6 text-xs font-bold uppercase tracking-[.14em] text-[#687890]">
            <span className="flex items-center gap-1.5"><strong className="text-base text-[#0e2347]">01</strong> Profile</span>
            <span className="h-1 w-1 rounded-full bg-[#d8e1ec]" />
            <span className="flex items-center gap-1.5"><strong className="text-base text-[#0e2347]">02</strong> Passport</span>
            <span className="h-1 w-1 rounded-full bg-[#d8e1ec]" />
            <span className="flex items-center gap-1.5"><strong className="text-base text-[#0e2347]">03</strong> Impact</span>
          </div>
        </div>

        <div className="relative z-10 flex justify-center lg:justify-end">
          <div className="passport-hero-wrap animate-float">
            <div className="passport-shadow" />
            <div className="passport-card">
              <div className="passport-card-navy">
                <div className="flex items-center gap-2">
                  <img src="/vocalist logo.png" alt="Vocalis" className="h-8 w-auto object-contain" />
                  <div>
                    <span className="font-display text-base font-bold tracking-tight text-white">Vocalis<span className="text-[#165de8]">.</span></span>
                    <p className="passport-tagline">Turning passion into impact</p>
                  </div>
                </div>
                <div className="absolute bottom-11 left-6">
                  <p className="font-display text-[10px] font-bold tracking-[.22em] text-white/90">VOCALIS</p>
                  <p className="mt-0.5 font-display text-[22px] font-bold tracking-[.09em] text-[#f4c641]">PASSPORT</p>
                  <div className="mt-2.5 h-0.5 w-16 bg-gradient-to-r from-[#ed1d40] to-[#165de8]" />
                  <p className="mt-1 text-[9px] text-white/60">Turning passion into impact</p>
                </div>
              </div>
              <div className="passport-card-paper">
                <div className="passport-photo">
                  <div className="passport-photo-placeholder">
                    <UserRound className="h-8 w-8 text-[#8f9cad]" />
                  </div>
                </div>
                <div className="passport-fields">
                  {[
                    ['NAME', 'Maya Okafor'],
                    ['VOCALIS ID', 'VOC-26-00001'],
                    ['LEVEL', 'Level One'],
                    ['DATE ISSUED', '31 Aug 2026'],
                    ['DATE JOINED', '31 Aug 2026'],
                    ['VOCALIS BADGE', 'EXPLORER']
                  ].map(([label, value]) => (
                    <div className="passport-field" key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="passport-divider" />
                <div className="passport-quote">
                  <div className="passport-quote-sig">
                    <span className="vocalis-signature-small">Vocalis</span>
                    <span>FOUNDER'S SIGNATURE</span>
                  </div>
                  <div className="passport-quote-tagline">
                    <span className="text-[#165de8] font-bold text-xs not-italic mr-1">“</span>
                    Turning passion into impact
                    <span className="text-[#165de8] font-bold text-xs not-italic ml-1">”</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="passport-note">
              <Sparkles className="h-4 w-4 text-[#f4c641]" /> Print-ready digital credential
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#dbe3ef] bg-[#eef3f9]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:grid-cols-3 lg:px-8">
          {[
            ['A Living Record', 'Every new level and badge automatically updates your official credential.'],
            ['Made to be Shared', 'Download high-quality print and digital PDFs for applications and portfolios.'],
            ['Always Verified', 'Securely held under your unique Vocalis ID and accessible anytime.']
          ].map(([title, body], index) => (
            <div className="flex gap-4" key={title}>
              <span className="font-display text-3xl font-bold text-[#ed1d40]/80">0{index + 1}</span>
              <div>
                <h2 className="font-display text-lg font-bold text-[#0e2347]">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-[#61718a]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#dbe3ef] px-5 py-7 text-center text-xs font-medium text-[#718097]">
        Vocalis Passport · Turning passion into impact {health?.status ? `· ${health.status}` : ''}
      </footer>
    </main>
  );
}

function AuthFallback({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [, setLocation] = useLocation();
  const login = mode === 'sign-in';
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const resetMutation = useRequestPasswordReset();
  const [resetMode, setResetMode] = useState(false);
  const mutation = login ? loginMutation : registerMutation;

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setSuccessMessage('');

    if (resetMode) {
      resetMutation.mutate(
        { data: { email: form.email } },
        {
          onSuccess: () => {
            setSuccessMessage('Reset instructions sent. Please check your email inbox.');
          },
          onError: (error) => setMessage(errorText(error)),
        }
      );
    } else if (login) {
      loginMutation.mutate(
        { data: { email: form.email, password: form.password } },
        {
          onSuccess: (res) => {
            const token = (res as unknown as { token?: string })?.token;
            if (typeof token === 'string') {
              localStorage.setItem('vocalis_token', token);
            }
            queryClient.invalidateQueries({ queryKey: ['/auth/me'] });
            if (res.user.role === 'admin') {
              setLocation('/admin');
            } else {
              setLocation('/dashboard');
            }
          },
          onError: (error) => setMessage(errorText(error)),
        }
      );
    } else {
      if (form.password !== form.confirmPassword) {
        setMessage('Passwords do not match.');
        return;
      }
      registerMutation.mutate(
        { data: form },
        {
          onSuccess: (res) => {
            const token = (res as unknown as { token?: string })?.token;
            if (typeof token === 'string') {
              localStorage.setItem('vocalis_token', token);
            }
            queryClient.invalidateQueries({ queryKey: ['/auth/me'] });
            setLocation('/dashboard');
          },
          onError: (error) => setMessage(errorText(error)),
        }
      );
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-art">
        <Logo dark />
        <div className="auth-art-copy">
          <div className="eyebrow text-white/70">
            <span className="eyebrow-line bg-[#f4c641]" /> Vocalis Digital Passport
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold leading-none text-white sm:text-5xl">
            Carry your<br />
            <span className="text-[#f4c641]">momentum.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-6 text-white/75">
            Your official record of the skills, leadership milestones, and impact you are building with Vocalis.
          </p>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-[#0e2347]" data-testid="link-auth-home">
            <ChevronRight className="h-4 w-4 rotate-180" /> Back to home
          </Link>
          
          <div className="mb-7">
            <p className="eyebrow">
              <span className="eyebrow-line" /> {resetMode ? 'Account Recovery' : login ? 'Member Access' : 'New Member'}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0e2347] sm:text-4xl">
              {resetMode ? 'Reset your password' : login ? 'Welcome back' : 'Create your passport'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {resetMode ? 'Enter your account email to receive recovery instructions.' : login ? 'Sign in to manage and download your Vocalis Passport.' : 'Join Vocalis and get your official membership ID.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {!login && !resetMode && (
              <>
                <Field label="Full Name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} placeholder="e.g. Maya Okafor" testId="input-full-name" />
                <Field label="Phone Number" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="e.g. +234 800 000 0000" testId="input-phone" />
              </>
            )}

            <Field label="Email Address" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="you@example.com" type="email" testId="input-email" />

            {!resetMode && (
              <Field label="Password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder="At least 6 characters" type="password" testId="input-password" />
            )}

            {!login && !resetMode && (
              <Field label="Confirm Password" value={form.confirmPassword} onChange={(value) => setForm({ ...form, confirmPassword: value })} placeholder="Repeat your password" type="password" testId="input-confirm-password" />
            )}

            {login && !resetMode && (
              <div className="flex justify-end">
                <button type="button" className="text-xs font-semibold text-[#165de8] hover:underline" onClick={() => { setResetMode(true); setMessage(''); setSuccessMessage(''); }} data-testid="button-forgot-password">
                  Forgot password?
                </button>
              </div>
            )}

            {message && (
              <div className="form-error" data-testid="text-auth-error">
                <CircleAlert className="h-4 w-4 shrink-0" /> {message}
              </div>
            )}

            {successMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-[#e8f7ef] p-3 text-xs font-semibold text-[#197044]" data-testid="text-auth-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMessage}
              </div>
            )}

            <Button type="submit" className="button-primary mt-3 h-12 w-full text-base font-bold shadow-md" disabled={mutation.isPending || resetMutation.isPending} data-testid="button-submit-auth">
              {mutation.isPending || resetMutation.isPending ? 'Please wait...' : resetMode ? 'Send Reset Instructions' : login ? 'Sign In to Passport' : 'Create My Passport'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {resetMode ? (
              <button type="button" onClick={() => { setResetMode(false); setMessage(''); setSuccessMessage(''); }} className="font-semibold text-[#165de8] hover:underline" data-testid="button-return-sign-in">
                Return to sign in
              </button>
            ) : (
              <>
                {login ? "Don't have a passport yet?" : 'Already a registered member?'}{' '}
                <Link href={login ? '/sign-up' : '/sign-in'} className="font-bold text-[#165de8] hover:underline" data-testid="link-switch-auth">
                  {login ? 'Register now' : 'Sign in'}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', testId, required = true }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; testId: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold text-[#203452]">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} required={required} className="h-11 rounded-xl border-[#d8e1ec] bg-white text-sm shadow-sm focus:border-[#165de8]" data-testid={testId} />
    </div>
  );
}

function SelectField({ label, value, options, onChange, testId, disabled, helpText }: { label: string; value: string; options: string[]; onChange: (value: string) => void; testId: string; disabled?: boolean; helpText?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold text-[#203452]">{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={cn(
          "h-11 w-full rounded-xl border border-[#d8e1ec] bg-white px-3 text-sm font-medium text-[#0e2347] shadow-sm outline-none focus:border-[#165de8] focus:ring-1 focus:ring-[#165de8]",
          disabled && "bg-[#f5f8fc] text-[#52617a] cursor-not-allowed opacity-90"
        )}
        data-testid={testId}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {helpText && <p className="text-[11px] text-muted-foreground">{helpText}</p>}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, error } = useGetCurrentUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) return <div className="min-h-[100dvh] bg-background p-6"><LoadingState /></div>;
  if (error || !user) return <Redirect to="/sign-in" />;

  // Automatically route admin users to the Founder Workspace
  if (user.role === 'admin' && (location === '/dashboard' || location === '/passport' || location === '/profile')) {
    return <Redirect to="/admin" />;
  }
  if (user.role !== 'admin' && location === '/admin') {
    return <Redirect to="/dashboard" />;
  }

  const nav = user.role === 'admin'
    ? [{ href: '/admin', label: 'Students', icon: Users }]
    : [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/profile', label: 'My Profile', icon: UserRound },
        { href: '/passport', label: 'My Passport', icon: FileBadge }
      ];

  return (
    <div className="app-shell">
      <aside className={cn('app-sidebar', mobileOpen && 'mobile-open')}>
        <div className="sidebar-top">
          <Logo dark />
          <button className="sidebar-close" onClick={() => setMobileOpen(false)} data-testid="button-close-menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="sidebar-context">
          <span className="sidebar-context-dot" />
          <span>{user.role === 'admin' ? 'Founder Workspace' : 'Student Portal'}</span>
        </div>

        <nav className="mt-8 space-y-1.5">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn('sidebar-link', location === href && 'sidebar-link-active')}
              key={href}
              data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
              {location === href && <ChevronRight className="ml-auto h-4 w-4 opacity-70" />}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles className="h-4 w-4 text-[#f4c641]" />
            <p>Keep your record current. New badges unlock opportunities.</p>
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 pt-4">
            <Avatar profile={user} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white" data-testid="text-sidebar-user">{user.fullName}</p>
              <p className="truncate text-xs font-medium text-[#f4c641]">{user.vocalisId}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 py-2 text-xs font-bold text-red-200 transition-colors hover:bg-red-500/25 hover:text-white"
            data-testid="button-sidebar-logout"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button className="menu-button" onClick={() => setMobileOpen(true)} data-testid="button-open-menu">
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="ml-auto flex items-center gap-3.5">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-[#0e2347]" data-testid="text-header-user">{user.fullName}</p>
              <p className="text-xs font-semibold text-[#165de8]">{user.role === 'admin' ? 'Founder & Admin' : 'Vocalis Member'}</p>
            </div>
            {clerkPubKey ? <ClerkLogoutButton /> : <ApiLogoutButton />}
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

function handleSignOut() {
  localStorage.removeItem('vocalis_token');
  try {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  } catch {}
  queryClient.clear();
  queryClient.setQueryData(['/auth/me'], null);
  window.location.href = '/';
}

function ApiLogoutButton() {
  return (
    <button
      onClick={handleSignOut}
      className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e1ec] bg-white px-3 py-2 text-xs font-bold text-[#52617a] shadow-sm transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
      title="Sign out of account"
      data-testid="button-logout"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}

function ClerkLogoutButton() {
  const { signOut } = useClerk();
  return (
    <button
      onClick={() => signOut({ redirectUrl: basePath || '/' })}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d8e1ec] bg-white text-[#52617a] shadow-sm transition-colors hover:bg-destructive/10 hover:text-destructive"
      title="Sign out"
      data-testid="button-logout"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0e2347] sm:text-3xl lg:text-4xl" data-testid="text-page-title">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

function DashboardPage() {
  const { data, isLoading, error, refetch } = useGetStudentDashboard();
  const download = useDownloadStudentPassportPdf({ query: { enabled: false, queryKey: getDownloadStudentPassportPdfQueryKey() } });
  const [downloadMsg, setDownloadMsg] = useState('');

  if (isLoading) return <LoadingState label="Loading your dashboard" />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;

  const profile = data.student;
  const passport = data.passport;

  async function handleDownload() {
    setDownloadMsg('');
    const result = await download.refetch();
    if (result.data instanceof Blob) {
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Vocalis_Passport_${profile.vocalisId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setDownloadMsg('Passport downloaded successfully!');
    } else {
      setDownloadMsg('Please generate your passport first.');
    }
  }

  return (
    <div data-testid="page-dashboard" className="space-y-6">
      <PageHeading
        eyebrow="Student Portal"
        title={`Welcome to Vocalis, ${profile.fullName.split(' ')[0]}`}
        subtitle="Your official digital passport and membership details in one place."
        action={
          <div className="flex flex-wrap gap-2.5">
            <Link href="/passport" className="button-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold shadow-md" data-testid="link-dashboard-passport">
              <FileBadge className="h-4 w-4" /> View Passport
            </Link>
            {passport && (
              <Button onClick={handleDownload} variant="outline" className="h-10 rounded-xl border-[#d8e1ec] bg-white font-bold text-[#0e2347] shadow-sm" disabled={download.isFetching} data-testid="button-dashboard-download">
                <Download className="mr-1.5 h-4 w-4" /> {download.isFetching ? 'Preparing...' : 'Download PDF'}
              </Button>
            )}
          </div>
        }
      />

      {downloadMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-[#e8f7ef] p-3.5 text-xs font-semibold text-[#197044] shadow-sm">
          <Check className="h-4 w-4 shrink-0" /> {downloadMsg}
        </div>
      )}

      {/* Hero Overview Card */}
      <div className="dashboard-hero">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-white/70">Official Membership Status</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              {passport ? 'Passport Active & Issued' : 'Passport In Progress'}
            </h2>
            <StatusPill status={profile.passportStatus} />
          </div>
          <p className="max-w-md text-sm leading-6 text-white/75">
            {passport
              ? `Issued on ${formatDate(passport.dateIssued)} · Your digital record is ready for download and sharing.`
              : 'Complete your profile details and upload a photo to generate your official Vocalis Passport.'}
          </p>
          <div className="pt-2">
            <Link
              href={passport ? '/passport' : '/profile'}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-[#f4c641] backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
              data-testid="link-dashboard-action"
            >
              {passport ? 'Preview Digital Passport' : 'Complete Profile Form'} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="dashboard-progress">
          <div className="progress-ring" style={{ '--progress': `${data.profileCompletion}%` } as CSSProperties}>
            <span>{data.profileCompletion}<small>%</small></span>
          </div>
          <p>Profile Readiness</p>
        </div>
      </div>

      {/* 4 Dashboard Metric Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="content-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#687890]">MY VOCALIS ID</p>
          <p className="mt-2 font-display text-lg font-bold text-[#165de8] sm:text-xl" data-testid="card-vocalis-id">{profile.vocalisId}</p>
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">Permanent Student ID</span>
        </div>

        <div className="content-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#687890]">CURRENT LEVEL</p>
          <p className="mt-2 font-display text-lg font-bold text-[#0e2347] sm:text-xl" data-testid="card-level">{profile.level}</p>
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">Level 1 of 6</span>
        </div>

        <div className="content-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#687890]">CURRENT BADGE</p>
          <p className="mt-2 font-display text-lg font-bold text-[#f4c641] sm:text-xl" data-testid="card-badge">{profile.badge}</p>
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">Specialization</span>
        </div>

        <div className="content-card p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#687890]">PASSPORT STATUS</p>
          <div className="mt-2">
            <StatusPill status={profile.passportStatus} />
          </div>
          <span className="mt-1 block text-[11px] font-medium text-muted-foreground">Joined {formatDate(profile.dateJoined)}</span>
        </div>
      </div>

      {/* Profile Details & Next Step Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <section className="content-card p-6" data-testid="card-profile-summary">
          <div className="flex items-start justify-between">
            <div>
              <p className="card-kicker">Student Credential</p>
              <h2 className="card-title mt-1">Profile Overview</h2>
            </div>
            <Link href="/profile" className="round-link" title="Edit profile" data-testid="link-edit-profile">
              <Pencil className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Avatar profile={profile} size="lg" />
            <div className="min-w-0">
              <h3 className="truncate font-display text-xl font-bold text-[#0e2347]" data-testid="text-dashboard-name">{profile.fullName}</h3>
              <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#eef3ff] px-2.5 py-0.5 text-xs font-bold text-[#165de8]">
                  <ShieldCheck className="h-3.5 w-3.5" /> {profile.level}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff9e6] px-2.5 py-0.5 text-xs font-bold text-[#b58500]">
                  <Award className="h-3.5 w-3.5" /> {profile.badge}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-y-4 border-t border-border pt-5">
            <DataPoint label="Vocalis ID" value={profile.vocalisId} testId="text-dashboard-vocalis-id" />
            <DataPoint label="Phone Number" value={profile.phone} testId="text-dashboard-phone" />
            <DataPoint label="Date Joined" value={formatDate(profile.dateJoined)} testId="text-dashboard-joined" />
            <DataPoint label="Date Issued" value={formatDate(profile.dateIssued)} testId="text-dashboard-issued" />
          </div>
        </section>

        <section className="content-card p-6" data-testid="card-next-step">
          <p className="card-kicker">Quick Actions</p>
          <h2 className="card-title mt-1">Passport Roadmap</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {passport
              ? 'Your official passport is generated and linked to your Vocalis profile. You can download the PDF anytime.'
              : 'Complete your information and portrait upload to unlock your official digital credential.'}
          </p>

          <div className="mt-6 space-y-3">
            {[
              ['Profile Information', data.profileCompletion >= 75, '/profile'],
              ['Portrait Uploaded', Boolean(profile.profilePhotoUrl), '/profile'],
              ['Digital Passport Generated', Boolean(passport), '/passport'],
            ].map(([label, done, href]) => (
              <Link href={href as string} className="step-row group" key={label as string} data-testid={`link-step-${(label as string).toLowerCase().replace(' ', '-')}`}>
                <span className={cn('step-check', done && 'step-check-done')}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <span />}
                </span>
                <span className="font-semibold text-[#0e2347] transition-colors group-hover:text-[#165de8]">{label as string}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <Link href="/passport" className="button-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-bold shadow-md">
              <FileBadge className="h-4 w-4" /> Open Digital Passport
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function DataPoint({ label, value, testId }: { label: string; value?: string | null; testId: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#687890]">{label}</p>
      <p className="mt-1 font-display text-sm font-semibold text-[#0e2347]" data-testid={testId}>
        {value || 'Not provided'}
      </p>
    </div>
  );
}

function ProfilePage() {
  const { data: profile, isLoading, error, refetch } = useGetStudentProfile();
  const update = useUpdateStudentProfile();
  const upload = useUploadStudentPhoto();
  const qc = useQueryClient();
  const [form, setForm] = useState({ fullName: '', phone: '', level: levels[0], badge: badges[0], dateJoined: '' });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName || '',
        phone: profile.phone || '',
        level: profile.level || levels[0],
        badge: profile.badge || badges[0],
        dateJoined: profile.dateJoined ? profile.dateJoined.slice(0, 10) : new Date().toISOString().slice(0, 10),
      });
    }
  }, [profile]);

  if (isLoading) return <LoadingState label="Loading your profile" />;
  if (error || !profile) return <ErrorState error={error} retry={refetch} />;

  function handleSave(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    update.mutate(
      { data: form as Parameters<typeof update.mutate>[0]['data'] },
      {
        onSuccess: (next) => {
          qc.setQueryData(getGetStudentProfileQueryKey(), next);
          qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
          setFeedback({ type: 'success', message: 'Profile details saved successfully!' });
        },
        onError: (err) => {
          setFeedback({ type: 'error', message: errorText(err) });
        },
      }
    );
  }

  function handlePhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Photo must be under 10MB.' });
      return;
    }

    // Set local preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    upload.mutate(
      { data: { photo: file } },
      {
        onSuccess: (next) => {
          qc.setQueryData(getGetStudentProfileQueryKey(), next);
          qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
          setFeedback({ type: 'success', message: 'Portrait photo uploaded and formatted successfully!' });
        },
        onError: (err) => {
          setFeedback({ type: 'error', message: errorText(err) });
        },
      }
    );
  }

  return (
    <div data-testid="page-profile" className="space-y-6">
      <PageHeading
        eyebrow="Student Profile"
        title="Edit Passport Profile"
        subtitle="The information below is embedded dynamically onto your official Vocalis Passport."
      />

      {feedback && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl p-4 text-sm font-semibold shadow-sm',
            feedback.type === 'success' ? 'bg-[#e8f7ef] text-[#197044]' : 'bg-destructive/10 text-destructive'
          )}
          data-testid="text-profile-feedback"
        >
          {feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <CircleAlert className="h-5 w-5 shrink-0" />}
          {feedback.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
        {/* Photo Upload & Preview Card */}
        <section className="content-card profile-photo-card">
          <div className="profile-photo-halo" />
          <div className="relative">
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="h-28 w-28 rounded-2xl object-cover shadow-lg ring-4 ring-white" />
            ) : (
              <Avatar profile={profile} size="xl" />
            )}
            {upload.isPending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-white">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            )}
          </div>

          <h2 className="mt-4 font-display text-xl font-bold text-[#0e2347]">{profile.fullName}</h2>
          <p className="text-xs font-bold text-[#165de8]">{profile.vocalisId}</p>

          <input
            type="file"
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handlePhotoSelect}
            data-testid="input-photo-upload"
          />

          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="button-secondary mt-6 h-11 rounded-xl px-5 font-bold"
            disabled={upload.isPending}
            data-testid="button-upload-photo"
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {upload.isPending ? 'Uploading Portrait...' : profile.profilePhotoUrl ? 'Replace Photo' : 'Upload Portrait'}
          </Button>

          <p className="mt-3 max-w-xs text-center text-xs leading-5 text-muted-foreground">
            Clear portrait photo (JPG, PNG, WebP). It will be automatically formatted for your official passport card.
          </p>
        </section>

        {/* Profile Details Form */}
        <form className="content-card p-6 sm:p-8" onSubmit={handleSave} data-testid="form-profile">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Full Name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} placeholder="Student Full Name" testId="input-profile-full-name" />
            </div>

            <div>
              <Label className="text-xs font-bold text-[#203452]">Vocalis ID</Label>
              <Input value={profile.vocalisId} disabled className="h-11 rounded-xl border-[#d8e1ec] bg-[#f5f8fc] font-bold text-[#165de8]" data-testid="input-profile-vocalis-id" />
              <p className="mt-1 text-[11px] text-muted-foreground">Assigned automatically by Vocalis.</p>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#203452]">Email Address</Label>
              <Input value={profile.email} disabled className="h-11 rounded-xl border-[#d8e1ec] bg-[#f5f8fc] text-[#52617a]" data-testid="input-profile-email" />
              <p className="mt-1 text-[11px] text-muted-foreground">Linked to your account.</p>
            </div>

            <Field label="Phone Number" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="+234 800 000 0000" testId="input-profile-phone" required={false} />

            <SelectField
              label="Current Level"
              value={form.level}
              options={levels}
              onChange={(value) => {
                const newBadge = levelToBadgeMap[value] || badges[0];
                setForm({ ...form, level: value, badge: newBadge });
              }}
              testId="select-profile-level"
            />

            <SelectField
              label="Vocalis Badge (Auto-Assigned)"
              value={form.badge}
              options={badges}
              onChange={() => {}}
              disabled={true}
              helpText="Badge is automatically assigned based on your level."
              testId="select-profile-badge"
            />

            <Field label="Date Joined" value={form.dateJoined} onChange={(value) => setForm({ ...form, dateJoined: value })} placeholder="" type="date" testId="input-profile-date-joined" />
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <Link href="/passport" className="text-xs font-bold text-[#165de8] hover:underline">
              Preview Passport &rarr;
            </Link>
            <Button className="button-primary h-11 px-6 font-bold shadow-md" type="submit" disabled={update.isPending} data-testid="button-save-profile">
              {update.isPending ? 'Saving...' : 'Save Profile Changes'}
              <Check className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PassportPage() {
  const { data: passport, isLoading, error, refetch } = useGetStudentPassport();
  const generate = useGenerateStudentPassport();
  const download = useDownloadStudentPassportPdf({ query: { enabled: false, queryKey: getDownloadStudentPassportPdfQueryKey() } });
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  function handleGenerate() {
    setFeedback(null);
    generate.mutate(undefined, {
      onSuccess: (next) => {
        qc.setQueryData(getGetStudentPassportQueryKey(), next);
        qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
        setShowCelebration(true);
      },
      onError: (err) => {
        setFeedback({ type: 'error', message: errorText(err) });
      },
    });
  }

  async function handleDownload() {
    setFeedback(null);
    try {
      const result = await download.refetch();
      if (result.data instanceof Blob) {
        const blob = new Blob([result.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const filename = `Vocalis_Passport_${passport?.vocalisId || 'credential'}.pdf`;

        const anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = url;
        anchor.download = filename;
        anchor.setAttribute('download', filename);
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';

        document.body.appendChild(anchor);
        anchor.click();

        setTimeout(() => {
          try {
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);
          } catch {}
        }, 60000);

        setFeedback({ type: 'success', message: 'PDF downloaded successfully to your device!' });
      } else {
        setFeedback({ type: 'error', message: errorText(result.error || 'Failed to download passport PDF.') });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: errorText(err) });
    }
  }

  if (isLoading) return <LoadingState label="Loading your passport" />;
  if (error && !passport) return <ErrorState error={error} retry={refetch} />;

  return (
    <div data-testid="page-passport" className="space-y-6">
      <PageHeading
        eyebrow="Official Credential"
        title="Your Vocalis Passport"
        subtitle="Digital membership card representing your journey, level, and impact."
        action={
          <div className="flex flex-wrap gap-2.5">
            <Link href="/profile" className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e1ec] bg-white px-4 py-2.5 text-xs font-bold text-[#0e2347] shadow-sm hover:bg-[#f8fafc]" data-testid="button-edit-info">
              <Pencil className="h-3.5 w-3.5" /> Edit Information
            </Link>
            {passport && (
              <Button variant="outline" onClick={handleDownload} disabled={download.isFetching} className="h-10 rounded-xl border-[#d8e1ec] bg-white font-bold text-[#0e2347] shadow-sm" data-testid="button-download-passport">
                <Download className="mr-1.5 h-4 w-4" /> {download.isFetching ? 'Preparing PDF...' : 'Download PDF'}
              </Button>
            )}
            <Button className="button-primary h-10 font-bold shadow-md" onClick={handleGenerate} disabled={generate.isPending} data-testid="button-generate-passport">
              <Sparkles className="mr-1.5 h-4 w-4" /> {generate.isPending ? 'Generating...' : passport ? 'Regenerate Passport' : 'Generate My Passport'}
            </Button>
          </div>
        }
      />

      {feedback && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl p-4 text-sm font-semibold shadow-sm',
            feedback.type === 'success' ? 'bg-[#e8f7ef] text-[#197044]' : 'bg-destructive/10 text-destructive'
          )}
          data-testid="text-passport-feedback"
        >
          {feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <CircleAlert className="h-5 w-5 shrink-0" />}
          {feedback.message}
        </div>
      )}

      {passport ? (
        <div className="passport-preview-layout">
          <div className="passport-full-preview">
            <PassportVisual passport={passport} />
          </div>

          <div className="passport-details content-card p-6">
            <p className="card-kicker">Passport Verification</p>
            <h2 className="card-title mt-1">Official Record</h2>

            <div className="mt-6 space-y-4">
              <DataPoint label="Passport Status" value="Active & Authorized" testId="text-passport-status" />
              <DataPoint label="Vocalis ID" value={passport.vocalisId} testId="text-passport-id" />
              <DataPoint label="Level" value={passport.level} testId="text-passport-level" />
              <DataPoint label="Current Badge" value={passport.badge} testId="text-passport-badge" />
              <DataPoint label="Date Issued" value={formatDate(passport.dateIssued)} testId="text-passport-issued" />
              <DataPoint label="Date Joined" value={formatDate(passport.dateJoined)} testId="text-passport-joined" />
            </div>

            <div className="mt-7 border-t border-border pt-5 space-y-3">
              <Button onClick={handleDownload} className="button-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-bold shadow-md" disabled={download.isFetching}>
                <Download className="h-4 w-4" /> Download Official PDF
              </Button>
              <p className="text-center text-[11px] leading-4 text-muted-foreground">
                High-resolution printable card format for phone and desktop.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-passport">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#165de8] shadow-sm">
            <FileBadge className="h-8 w-8" />
          </div>
          <h2 className="mt-5 font-display text-2xl font-bold text-[#0e2347]">Your Passport is Ready to be Generated</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Review your information, then click Generate to create your official digital Vocalis Passport.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button className="button-primary h-11 px-6 font-bold shadow-md" onClick={handleGenerate} disabled={generate.isPending} data-testid="button-empty-generate">
              <Sparkles className="mr-2 h-4 w-4" /> {generate.isPending ? 'Generating...' : 'Generate My Passport'}
            </Button>
            <Link href="/profile" className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8e1ec] bg-white px-5 text-sm font-bold text-[#0e2347] shadow-sm hover:bg-[#f8fafc]">
              Review Profile Details
            </Link>
          </div>
        </div>
      )}

      {/* Celebratory Modal on Generation */}
      {showCelebration && passport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-rise" data-testid="modal-celebration">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white p-6 shadow-2xl sm:p-8">
            <button
              onClick={() => setShowCelebration(false)}
              className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f4c641]/20 to-[#f4c641]/5 text-[#b58500]">
                <Sparkles className="h-8 w-8 text-[#f4c641] animate-pulse" />
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold text-[#0e2347] sm:text-3xl">
                Your Vocalis Passport is Ready!
              </h2>
              <p className="mt-2 text-base font-medium text-[#165de8]">
                Welcome to Vocalis, {passport.fullName}.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You are officially a <strong className="text-[#0e2347]">{passport.level}</strong> Vocalis member with the <strong className="text-[#0e2347]">{passport.badge}</strong> badge.
              </p>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="w-full max-w-[360px] overflow-hidden rounded-xl border border-border shadow-md">
                <PassportVisual passport={passport} />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <Button
                onClick={() => {
                  handleDownload();
                  setShowCelebration(false);
                }}
                className="button-primary h-12 flex-1 font-bold shadow-md"
                data-testid="button-celebration-download"
              >
                <Download className="mr-2 h-4 w-4" /> Download My Passport
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCelebration(false);
                  setLocation('/profile');
                }}
                className="h-12 flex-1 rounded-xl border-[#d8e1ec] font-bold text-[#0e2347]"
                data-testid="button-celebration-profile"
              >
                <UserRound className="mr-2 h-4 w-4" /> View My Profile
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PassportVisual({ passport }: { passport: Passport | AdminStudent }) {
  return (
    <div className="passport-render" data-testid="passport-card-render">
      {/* Navy Left Section */}
      <div className="passport-render-navy">
        <div className="flex items-center gap-2.5">
          <img src="/vocalist logo.png" alt="Vocalis" className="h-10 w-auto object-contain" />
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-white">Vocalis<span className="text-[#165de8]">.</span></span>
            <p className="text-[9px] tracking-wide text-white/70">Turning passion into impact</p>
          </div>
        </div>

        <div className="passport-render-bottom">
          <p>VOCALIS</p>
          <strong>PASSPORT</strong>
          <div className="my-1.5 h-0.5 w-16 bg-gradient-to-r from-[#ed1d40] to-[#165de8]" />
          <span>Turning passion into impact</span>
        </div>
      </div>

      {/* White Right Section with Centralized Logo Watermark */}
      <div className="passport-render-paper">
        <div className="render-photo">
          {passport.profilePhotoUrl ? (
            <img src={passport.profilePhotoUrl} alt={passport.fullName} className="h-full w-full object-cover" />
          ) : (
            <Avatar profile={passport} size="lg" />
          )}
        </div>

        <div className="render-info">
          <RenderField label="NAME" value={passport.fullName} />
          <RenderField label="VOCALIS ID" value={passport.vocalisId} />
          <RenderField label="LEVEL" value={passport.level} />
          <RenderField label="DATE ISSUED" value={formatDate(passport.dateIssued)} />
          <RenderField label="DATE JOINED" value={formatDate(passport.dateJoined)} />
          <RenderField label="VOCALIS BADGE" value={passport.badge.toUpperCase()} />
        </div>

        <div className="passport-divider" />

        <div className="render-signature">
          <div className="flex flex-col">
            <span className="vocalis-signature">Vocalis</span>
            <span className="text-[9px] font-bold tracking-wider text-[#687890] uppercase mt-1">FOUNDER'S SIGNATURE</span>
          </div>
          <div className="flex items-center text-sm italic text-[#52617a]">
            <span className="mr-1 text-base font-bold text-[#165de8] not-italic">“</span>
            Turning passion into impact
            <span className="ml-1 text-base font-bold text-[#165de8] not-italic">”</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RenderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="render-field">
      <div className="min-w-0 flex-1">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function AdminPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const params = useMemo(() => (search ? { search } : undefined), [search]);
  const { data: students, isLoading, error, refetch } = useListAdminStudents(params);
  const selected = students?.find((student) => student.id === selectedId);

  return (
    <div data-testid="page-admin" className="space-y-6">
      <PageHeading
        eyebrow="Founder Workspace"
        title="Student Passport Management"
        subtitle="Review registered students, update levels & badges, and issue official passports."
        action={
          <div className="admin-count">
            <Users className="h-4 w-4" /> {students?.length || 0} Registered Students
          </div>
        }
      />

      <div className="admin-toolbar">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl border-[#d8e1ec] bg-white pl-10 text-sm shadow-sm"
            placeholder="Search by student name, email, or Vocalis ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="input-admin-search"
          />
        </div>
        <Button variant="outline" onClick={() => refetch()} className="h-11 rounded-xl border-[#d8e1ec] bg-white font-bold text-[#0e2347] shadow-sm" data-testid="button-refresh-students">
          <BarChart3 className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingState label="Loading student records" />
      ) : error ? (
        <ErrorState error={error} retry={refetch} />
      ) : !students?.length ? (
        <div className="empty-admin">
          <Search className="h-9 w-9 text-[#165de8]" />
          <h2 className="mt-4 font-display text-xl font-bold text-[#0e2347]">No students found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {search ? 'Try adjusting your search criteria.' : 'Registered students will appear in this directory.'}
          </p>
        </div>
      ) : (
        <div className="admin-grid">
          <section className="content-card overflow-hidden">
            <div className="hidden grid-cols-[1.5fr_1fr_.7fr_.6fr_44px] gap-4 border-b border-border bg-[#f7f9fc] px-5 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground sm:grid">
              <span>Student</span>
              <span>Vocalis ID</span>
              <span>Level</span>
              <span>Passport</span>
              <span />
            </div>
            {students.map((student) => (
              <StudentRow
                key={student.id}
                student={student}
                selected={selectedId === student.id}
                onClick={() => setSelectedId(student.id)}
              />
            ))}
          </section>

          {selected ? (
            <AdminStudentPanel student={selected} close={() => setSelectedId(null)} />
          ) : (
            <div className="admin-selection">
              <Users className="h-9 w-9 text-[#165de8]/60" />
              <h2 className="mt-4 font-display text-lg font-bold text-[#0e2347]">Select a student</h2>
              <p className="mt-1 max-w-xs text-center text-sm leading-6 text-muted-foreground">
                Select a student record to review details, change levels & badges, or generate an updated passport.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudentRow({ student, selected, onClick }: { student: AdminStudent; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn('student-row', selected && 'student-row-selected', !student.active && 'opacity-60')}
      data-testid={`button-student-${student.id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar profile={student} size="sm" />
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-bold text-[#0e2347]">{student.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{student.email}</p>
        </div>
      </div>
      <span className="text-left font-display text-xs font-bold text-[#165de8]">{student.vocalisId}</span>
      <span className="hidden text-left text-xs font-semibold text-[#52617a] sm:block">{student.level}</span>
      <span className="hidden sm:block">
        <StatusPill status={student.passportStatus} />
      </span>
      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function AdminStudentPanel({ student, close }: { student: AdminStudent; close: () => void }) {
  const qc = useQueryClient();
  const { data: detail } = useGetAdminStudent(student.id);
  const adminUpdate = useUpdateAdminStudent();
  const generate = useGenerateAdminStudentPassport();
  const deactivate = useDeactivateAdminStudent();
  const download = useDownloadAdminStudentPassportPdf(student.id, {
    query: { enabled: false, queryKey: getDownloadAdminStudentPassportPdfQueryKey(student.id) },
  });

  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({
    fullName: student.fullName,
    phone: student.phone,
    level: student.level,
    badge: student.badge,
    dateJoined: student.dateJoined ? student.dateJoined.slice(0, 10) : '',
    dateIssued: student.dateIssued ? student.dateIssued.slice(0, 10) : '',
  });

  function handleSave(event: FormEvent) {
    event.preventDefault();
    adminUpdate.mutate(
      {
        id: student.id,
        data: { ...form, dateIssued: form.dateIssued || null } as Parameters<typeof adminUpdate.mutate>[0]['data'],
      },
      {
        onSuccess: (next) => {
          qc.invalidateQueries({ queryKey: getListAdminStudentsQueryKey() });
          qc.setQueryData(getGetAdminStudentQueryKey(student.id), next);
          setEditing(false);
          setFeedback('Student details updated successfully!');
        },
        onError: (err) => setFeedback(errorText(err)),
      }
    );
  }

  function handleIssue() {
    generate.mutate(
      { id: student.id },
      {
        onSuccess: (passport) => {
          setFeedback('Passport generated and issued!');
          qc.invalidateQueries({ queryKey: getListAdminStudentsQueryKey() });
          qc.setQueryData(getGetAdminStudentQueryKey(student.id), {
            ...student,
            ...passport,
            passportStatus: 'active',
          });
        },
        onError: (err) => setFeedback(errorText(err)),
      }
    );
  }

  function handleDeactivate() {
    if (!window.confirm(`Are you sure you want to delete ${student.fullName}'s account? This will permanently remove the record and free up their email and credentials.`)) return;
    deactivate.mutate(
      { id: student.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey[0];
              return typeof key === 'string' && key.startsWith('/api/admin/students');
            },
          });
          qc.removeQueries({ queryKey: getGetAdminStudentQueryKey(student.id) });
          close();
        },
        onError: (err) => setFeedback(errorText(err)),
      }
    );
  }

  async function handleDownload() {
    try {
      const result = await download.refetch();
      if (result.data instanceof Blob) {
        const blob = new Blob([result.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const filename = `Vocalis_Passport_${student.vocalisId}.pdf`;

        const anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = url;
        anchor.download = filename;
        anchor.setAttribute('download', filename);
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';

        document.body.appendChild(anchor);
        anchor.click();

        setTimeout(() => {
          try {
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);
          } catch {}
        }, 60000);
      } else {
        setFeedback(errorText(result.error || 'Failed to download passport PDF.'));
      }
    } catch (err) {
      setFeedback(errorText(err));
    }
  }

  return (
    <aside className="admin-panel content-card" data-testid={`panel-student-${student.id}`}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="card-kicker">Student Profile</p>
        <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" onClick={close} data-testid="button-close-student-panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-4">
          <Avatar profile={detail || student} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-bold text-[#0e2347]">{student.fullName}</h2>
            <p className="truncate text-xs font-semibold text-[#165de8]">{student.vocalisId}</p>
            <div className="mt-1.5">
              <StatusPill status={student.passportStatus} />
            </div>
          </div>
        </div>

        {feedback && (
          <p className="mt-4 rounded-xl bg-secondary p-3 text-xs font-semibold text-secondary-foreground" data-testid="text-admin-feedback">
            {feedback}
          </p>
        )}

        {editing ? (
          <form className="mt-5 space-y-4" onSubmit={handleSave}>
            <Field label="Full Name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} placeholder="" testId="input-admin-name" />
            <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="" testId="input-admin-phone" required={false} />
            
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Level"
                value={form.level}
                options={levels}
                onChange={(value) => {
                  const newBadge = levelToBadgeMap[value] || badges[0];
                  setForm({ ...form, level: value, badge: newBadge });
                }}
                testId="select-admin-level"
              />
              <SelectField
                label="Badge (Auto-Assigned)"
                value={form.badge}
                options={badges}
                onChange={(value) => setForm({ ...form, badge: value })}
                testId="select-admin-badge"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date Joined" value={form.dateJoined} onChange={(value) => setForm({ ...form, dateJoined: value })} placeholder="" type="date" testId="input-admin-date-joined" />
              <Field label="Date Issued" value={form.dateIssued} onChange={(value) => setForm({ ...form, dateIssued: value })} placeholder="" type="date" testId="input-admin-date-issued" required={false} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="button-primary h-10 flex-1 font-bold shadow-md" disabled={adminUpdate.isPending} data-testid="button-save-admin-student">
                Save Changes
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)} className="h-10 rounded-xl border-[#d8e1ec] font-bold" data-testid="button-cancel-admin-edit">
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-y-4 border-y border-border py-4">
              <DataPoint label="Email" value={student.email} testId="text-admin-email" />
              <DataPoint label="Phone" value={student.phone} testId="text-admin-phone" />
              <DataPoint label="Level" value={student.level} testId="text-admin-level" />
              <DataPoint label="Badge" value={student.badge} testId="text-admin-badge" />
              <DataPoint label="Date Joined" value={formatDate(student.dateJoined)} testId="text-admin-joined" />
              <DataPoint label="Date Issued" value={formatDate(student.dateIssued)} testId="text-admin-issued" />
            </div>

            <div className="mt-5 space-y-2.5">
              <Button variant="outline" className="h-10 w-full justify-start rounded-xl border-[#d8e1ec] font-bold text-[#0e2347] shadow-sm" onClick={() => setEditing(true)} data-testid="button-edit-admin-student">
                <Pencil className="mr-2 h-4 w-4" /> Edit Student Details
              </Button>
              <Button className="button-primary h-10 w-full justify-start font-bold shadow-md" onClick={handleIssue} disabled={generate.isPending || !student.active} data-testid="button-generate-admin-passport">
                <Sparkles className="mr-2 h-4 w-4" /> {generate.isPending ? 'Generating...' : student.passportStatus === 'active' ? 'Regenerate Passport' : 'Generate Passport'}
              </Button>
              {student.passportStatus === 'active' && (
                <Button variant="outline" className="h-10 w-full justify-start rounded-xl border-[#d8e1ec] font-bold text-[#0e2347] shadow-sm" onClick={handleDownload} disabled={download.isFetching} data-testid="button-download-admin-passport">
                  <Download className="mr-2 h-4 w-4" /> Download Passport PDF
                </Button>
              )}
              <Button variant="ghost" className="mt-2 h-10 w-full justify-start rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDeactivate} disabled={deactivate.isPending} data-testid="button-deactivate-student">
                <Trash2 className="mr-2 h-4 w-4" /> Delete & Free Credentials
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function formatDate(value?: string | null) {
  if (!value) return 'Not issued';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/dashboard"><Shell><DashboardPage /></Shell></Route>
      <Route path="/profile"><Shell><ProfilePage /></Shell></Route>
      <Route path="/passport"><Shell><PassportPage /></Shell></Route>
      <Route path="/admin"><Shell><AdminPage /></Shell></Route>
      <Route component={NotFoundPage} />
    </Switch>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-center">
      <div>
        <Logo />
        <h1 className="mt-8 font-display text-4xl font-bold text-[#0e2347]">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page you are looking for does not exist.</p>
        <Link href="/" className="button-primary mt-6 inline-flex items-center gap-2 px-6 py-3 font-bold" data-testid="link-not-found-home">
          Return Home
        </Link>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/sign-in/*?" component={() => clerkPubKey ? <div className="auth-clerk"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div> : <AuthFallback mode="sign-in" />} />
      <Route path="/sign-up/*?" component={() => clerkPubKey ? <div className="auth-clerk"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div> : <AuthFallback mode="sign-up" />} />
      <ProtectedRoutes />
    </Switch>
  );
}

function AppWithAuth() {
  if (!clerkPubKey) return <AppRoutes />;
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome to Vocalis', subtitle: 'Sign in to access your digital passport' } },
        signUp: { start: { title: 'Create your Vocalis Passport', subtitle: 'Start your official membership record' } },
      }}
      appearance={{
        options: {
          logoPlacement: 'inside',
          logoLinkUrl: basePath || '/',
        },
        variables: {
          colorPrimary: '#165de8',
          colorForeground: '#0e2347',
          colorMutedForeground: '#52617a',
          colorBackground: '#ffffff',
          colorInput: '#f5f8fc',
          colorInputForeground: '#0e2347',
          colorDanger: '#b72d38',
          colorNeutral: '#d7e0ec',
          fontFamily: 'DM Sans',
          borderRadius: '12px',
        },
      }}
    >
      <AppRoutes />
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={basePath}>
        <AppWithAuth />
      </WouterRouter>
    </QueryClientProvider>
  );
}