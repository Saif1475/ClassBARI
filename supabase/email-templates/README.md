# ClassBARI email templates (English + Bangla)

Paste each file into Supabase → Authentication → Emails → Templates, then Save:

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | confirm-signup.html | Confirm your ClassBARI email · ইমেইল নিশ্চিত করুন |
| Reset password | reset-password.html | Set a new ClassBARI password · নতুন পাসওয়ার্ড |
| Change email address | change-email.html | Confirm your new email · নতুন ইমেইল নিশ্চিত করুন |

`{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .NewEmail }}` are filled in by Supabase. Do the real project; the test project is optional.
