import { showDate, type Note } from "@/lib/lots";

// A lot's remarks, newest first. Used on the owner's card and on the job worker's page.
export default function Notes({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <ul className="notes">
      {[...notes].reverse().map((n) => (
        <li key={n.at} className={n.problem ? "problem" : ""}>
          <span className="small muted">
            {n.voice ? "Voice note" : "Note"} · {n.status} ·{" "}
            {new Date(n.at).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
            {n.problem && <strong> · PROBLEM</strong>}
          </span>
          {n.summary && <strong>{n.summary}</strong>}
          <span>{n.text}</span>
          {n.new_date && <span className="small">New date mentioned: <strong>{showDate(n.new_date)}</strong></span>}
        </li>
      ))}
    </ul>
  );
}
