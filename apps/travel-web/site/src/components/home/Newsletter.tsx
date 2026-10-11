import { useState, type FormEvent } from "react";
import { validEmail } from "../../utils/newsletter";
import Icon from "../Icon";
export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("email") ?? "");
    if (!validEmail(value)) {
      setError(true);
      setSuccess(false);
      return;
    }
    setEmail("");
    setError(false);
    setSuccess(true);
  };
  return (
    <section
      className="newsletter container"
      id="newsletter"
      aria-labelledby="newsletter-title"
    >
      <div>
        <p className="eyebrow">A LITTLE INSPIRATION, NOW AND THEN</p>
        <h2 id="newsletter-title">
          Your next good day
          <br />
          starts with a little spark.
        </h2>
        <p>Slow-travel stories and places to daydream about.</p>
      </div>
      <div className="newsletter-form-wrap">
        <form onSubmit={submit} noValidate aria-label="Demo newsletter signup">
          <label htmlFor="newsletter-email">Email address</label>
          <div className="newsletter-controls">
            <input
              id="newsletter-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              aria-invalid={error}
              aria-describedby="newsletter-help"
              onChange={(e) => {
                setEmail(e.target.value);
                setSuccess(false);
              }}
            />
            <button className="button primary" type="submit">
              Count me in <Icon name="arrow" size={18} />
            </button>
          </div>
          {error ? (
            <p className="newsletter-error" role="alert">
              Enter a valid email address.
            </p>
          ) : null}
          {success ? (
            <p className="newsletter-success" role="status">
              Demo signup complete. You are not subscribed; no email was sent or
              saved.
            </p>
          ) : null}
        </form>
        <p id="newsletter-help">
          Demo form only. No email is sent, stored, or shared.
        </p>
      </div>
    </section>
  );
}
