"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";

/** A password box with an eye button to show or hide what was typed. Takes the same props as an input. */
export function PasswordInput({ className = "", ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { t } = useLang();
  const [shown, setShown] = useState(false);
  return (
    <span className="relative flex">
      <input {...props} type={shown ? "text" : "password"} className={`${className} w-full min-w-0 pr-14`} />
      <button
        type="button"
        aria-pressed={shown}
        aria-label={shown ? t.auth.hidePassword : t.auth.showPassword}
        title={shown ? t.auth.hidePassword : t.auth.showPassword}
        onClick={() => setShown((v) => !v)}
        className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
      >
        <Icon name={shown ? "eyeOff" : "eye"} size={20} />
      </button>
    </span>
  );
}
