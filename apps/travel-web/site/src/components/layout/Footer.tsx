import { IMAGE_CREDITS } from "../../data/mockData";
export default function Footer({
  onSection,
}: {
  onSection: (id: string) => void;
}) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <a className="wordmark" href="#/" aria-label="ChivaGo home">
              ChivaGo
              <span className="brand-dot" aria-hidden="true">
                ✳
              </span>
            </a>
            <p>
              A little closer to somewhere good.
              <br />
              Thailand, at your own pace.
            </p>
          </div>
          <nav aria-label="Footer navigation">
            <button onClick={() => onSection("destinations")}>
              Destinations
            </button>
            <button onClick={() => onSection("marketplace")}>
              Tours, stays & experiences
            </button>
            <button onClick={() => onSection("why-chivago")}>
              Our approach
            </button>
          </nav>
          <div className="footer-demo">
            <strong>Made for exploring, not booking.</strong>
            <p>
              Front-end prototype. All business listings,
              <br />
              prices, ratings, and testimonials are fictional.
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} ChivaGo · Travel marketplace demo</p>
          <span>English · THB</span>
        </div>
        <div className="footer-details">
          <details>
            <summary>Image credits & licenses</summary>
            <p>
              Illustrative photos stored locally, resized as WebP. Licensed
              under the{" "}
              <a
                href="https://www.pexels.com/license/"
                target="_blank"
                rel="noreferrer"
              >
                Pexels License
              </a>
              . No photographer endorses these fictional listings.
            </p>
            <ul>
              {IMAGE_CREDITS.map((credit) => (
                <li key={credit.id}>
                  <a href={credit.source} target="_blank" rel="noreferrer">
                    {credit.id} · {credit.creator}
                  </a>
                </li>
              ))}
            </ul>
            <p>
              No existing mascot art was reused. Wordmark and interface icons
              are original code-native marks.
            </p>
          </details>
          <details>
            <summary>Demo privacy & booking notice</summary>
            <p>
              No account, tracking, payment, backend, or booking database.
              Search settings live only in memory and reset on refresh.
              Newsletter emails are not sent or saved. Existing ChivaGo inquiry
              flows remain unchanged.
            </p>
          </details>
        </div>
      </div>
    </footer>
  );
}
