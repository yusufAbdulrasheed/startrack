import { cn } from "@/lib/utils";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-[12.5px] font-semibold text-t2 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-t3 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full h-10 px-3.5 rounded-xl bg-surface border border-line-2 text-[13px] text-t1 placeholder:text-t4 hover:border-t4 focus:outline-none focus:border-primary focus:shadow-[var(--st-focus-ring)] transition-[border-color,box-shadow] disabled:bg-surface-2 disabled:text-t3";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, "appearance-none", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "h-auto py-2.5 resize-none", props.className)} />;
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="px-3 py-2 rounded-ctl bg-danger-soft text-danger text-[12.5px] font-medium">
      {message}
    </div>
  );
}
