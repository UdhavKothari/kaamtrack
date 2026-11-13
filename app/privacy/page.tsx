// Public privacy policy. Meta needs it before the WhatsApp app can be published; Google needs it to publish sign-in.
export const metadata = { title: "Privacy · KaamTrack" };

export default function Privacy() {
  return (
    <main className="worker">
      <h1>KaamTrack privacy</h1>
      <div className="card panel">
        <p>
          KaamTrack helps a textile business in Surat keep track of fabric lots sent out to job workers for dyeing,
          printing, embroidery and finishing. This page says what it keeps, what it doesn&apos;t, and why.
        </p>

        <h2>What we keep</h2>
        <ul>
          <li><b>Lot details</b>: job worker name, facility, phone number, process, fabric quality, quantity, taka, challan number, promised date and status.</li>
          <li><b>The challan photo</b> the owner took, so the lot can be checked against the paper later.</li>
          <li><b>Remarks and voice note text</b> a job worker sends: the written transcript and a one-line summary.</li>
          <li><b>WhatsApp messages</b> about a lot: reminders we send, replies the job worker sends, and whether each was delivered.</li>
          <li><b>Owner sign-in</b>: the Google email address of people the owner allows onto the board.</li>
        </ul>

        <h2>What we don&apos;t keep</h2>
        <ul>
          <li><b>Voice recordings.</b> The audio is read once and thrown away; only the text stays.</li>
          <li><b>PDF files.</b> Each page is turned into a picture on the phone; the PDF itself never leaves it.</li>
          <li><b>Google passwords or contacts.</b> Sign-in only tells us your email address.</li>
          <li>No ads, no tracking, and nothing is sold or shared for marketing.</li>
        </ul>

        <h2>Who else sees it</h2>
        <ul>
          <li><b>Google Gemini</b> reads challan photos and voice notes to fill in the lot.</li>
          <li><b>Meta (WhatsApp)</b> carries the reminder and reply messages.</li>
          <li><b>Vercel and Upstash</b> host the app and store the data.</li>
        </ul>

        <h2>How long, and deleting it</h2>
        <p>
          Everything about a lot is kept until the owner deletes the lot. Deleting it removes the details, photo,
          notes and message history, and the job worker&apos;s link stops working. A job worker who wants their data
          removed, or who wants to stop getting reminders, can ask the business that sent them the link.
        </p>
      </div>
      <p className="muted small">Last updated 13 November 2026.</p>
    </main>
  );
}
