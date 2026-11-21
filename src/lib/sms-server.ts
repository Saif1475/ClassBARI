// Sends SMS through a Bangladeshi bulk-SMS provider. Without SMS_API_KEY nothing is sent: messages
// are only logged ("test"), so the app can be tried for free.
// The request format below is BulkSMSBD's (bulksmsbd.net); check it against your provider's API page,
// or set SMS_API_URL / change this one function if you pick another provider.
const URL = process.env.SMS_API_URL || "https://bulksmsbd.net/api/smsapi";

export const smsLive = () => !!process.env.SMS_API_KEY;

export async function sendSms(numbers: string[], text: string): Promise<"sent" | "test" | "failed"> {
  const key = process.env.SMS_API_KEY;
  if (!key) return "test";
  try {
    const res = await fetch(URL, {
      method: "POST",
      body: new URLSearchParams({ api_key: key, type: "text", senderid: process.env.SMS_SENDER_ID ?? "", number: numbers.map((n) => `88${n}`).join(","), message: text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { response_code?: number };
    if (res.ok && body.response_code === 202) return "sent";
    console.error("SMS provider refused", res.status, body);
  } catch (err) {
    console.error("SMS provider unreachable", err);
  }
  return "failed";
}
