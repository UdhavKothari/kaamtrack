import type { Metadata } from "next";
import { MENU, PHRASES } from "@/lib/inbound";
import { REMINDER_TEMPLATE } from "@/lib/lots";
import { STATUSES } from "@/lib/lots";

export const metadata: Metadata = { title: "How WhatsApp works – KaamTrack" };

const FLOW = [
  ["We send a reminder", "Every morning at 9:00 IST for lots due today or late, or when you tap Send reminder now."],
  ["The job worker replies", "With a number (1 to 4) or a word such as Ready or ho gaya. Or taps the link in the message."],
  ["The app finds the lot", "Matches the sender's number to their open lots. One lot: that one. Several: the one they name, else the one reminded last, else it asks."],
  ["The board updates", "The status changes and the board shows it within seconds, with a note in that lot's WhatsApp conversation."],
  ["The app answers", "A short confirmation, or a polite question if it couldn't tell what they meant. Nothing is ever guessed."],
  ["Delivery ticks update", "Sent, Delivered, Read or Failed, shown next to each message we sent."],
];

const SENDS = [
  ["Reminder", "Daily 9:00 IST, or Send reminder now", REMINDER_TEMPLATE, "A pre-approved template. Free when the job worker messaged us in the last 24 hours; otherwise Meta bills per message."],
  ["Confirmation", "After a reply that changes a status", "Thanks. Your dyeing lot of 1200 metres is marked Ready ✓", "Free: it falls inside the 24-hour window the job worker just opened."],
  ["Not understood", "A reply we can't read", `Sorry, I didn't understand. ${MENU}`, "Free, same reason."],
  ["Which lot?", "Several open lots and nothing says which", 'Which lot? Reply like "3 1200" (status number, then the lot\'s quantity), or tap your link.', "Free, same reason."],
];

export default function HowItWorks() {
  return (
    <main className="doc">
      <p><a href="/">← Back to the board</a></p>
      <h1>How WhatsApp works here</h1>
      <p className="lede">
        Job workers update their lots by replying on WhatsApp, and the app answers back. Right now this runs as a <strong>simulation</strong>: open any lot's
        WhatsApp conversation on the board and play the job worker yourself. Going live changes only where messages travel, not what the app does with them.
      </p>

      <h2>The conversation, step by step</h2>
      <ol className="flow">
        {FLOW.map(([title, text]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <h2>What we send</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Message</th><th>When</th><th>Text</th><th>Cost</th></tr>
          </thead>
          <tbody>
            {SENDS.map(([name, when, text, cost]) => (
              <tr key={name}><th scope="row">{name}</th><td>{when}</td><td>{text}</td><td>{cost}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What we understand</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Status</th><th>Number</th><th>Words (Hindi in English letters too)</th></tr>
          </thead>
          <tbody>
            {STATUSES.map((s, i) => (
              <tr key={s}><th scope="row">{s}</th><td>{i + 1}</td><td>{PHRASES[s].filter((p) => /^[a-z ]+$/.test(p)).join(", ")}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        A reply that mixes two statuses (for example "ready and dispatched") is treated as not understood. Photos, voice notes and stickers get no answer. A number we never sent to gets no answer.
        If a job worker has several open lots, "3 1200" means status 3 for the lot of 1200.
      </p>

      <h2>Simulated now, real later</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Part</th><th>Today</th><th>When WhatsApp is live</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">Sending</th><td>Recorded and shown, nothing leaves the app</td><td>Sent through Meta's WhatsApp Cloud API</td></tr>
            <tr><th scope="row">Delivery ticks</th><td>Delivered a few seconds after sending</td><td>Real receipts from Meta</td></tr>
            <tr><th scope="row">Reading replies, finding the lot, updating the status, answering</th><td colSpan={2}>Identical. This is the same code in both cases.</td></tr>
            <tr><th scope="row">Switching on</th><td colSpan={2}>Set <code>WHATSAPP_MODE=meta</code> with the Meta keys, point Meta's webhook at <code>/api/whatsapp/webhook</code>, and get the reminder text above approved as a template.</td></tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
