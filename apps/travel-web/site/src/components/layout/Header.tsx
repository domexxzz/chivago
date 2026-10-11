import { useState } from "react";
import Icon from "../Icon";

export default function Header({
  onSection,
}: {
  onSection: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = (id: string) => {
    setOpen(false);
    onSection(id);
  };
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="demo-bar">
        A little room to imagine.{" "}
        <span>Demo only · fictional listings · no real bookings</span>
      </div>
      <header className="site-header">
        <a className="wordmark" href="#/" aria-label="ChivaGo home">
          ChivaGo
          <span className="brand-dot" aria-hidden="true">
            ✳
          </span>
        </a>
        <nav
          aria-label="Main navigation"
          className={open ? "main-nav is-open" : "main-nav"}
          id="main-navigation"
        >
          <button onClick={() => navigate("destinations")}>Destinations</button>
          <button onClick={() => navigate("marketplace")}>
            Find your trip
          </button>
          <button onClick={() => navigate("why-chivago")}>Our approach</button>
        </nav>
        <div className="header-actions">
          <span className="header-currency">EN · THB</span>
          <button
            className="sign-in"
            disabled
            title="Accounts are not available in this prototype"
          >
            Sign in <span>Coming soon</span>
          </button>
          <button
            className="menu-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </header>
    </>
  );
}
