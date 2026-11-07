import type { InputHTMLAttributes, ReactNode } from 'react';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
}

export function AuthField({ label, icon, className = '', id, ...props }: AuthFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <label htmlFor={fieldId} className="auth-field">
      <span className="auth-field__label">{label}</span>
      <div className="auth-field__wrap">
        {icon ? <span className="auth-field__icon">{icon}</span> : null}
        <input id={fieldId} className={`auth-field__input ${className}`} {...props} />
      </div>
    </label>
  );
}
