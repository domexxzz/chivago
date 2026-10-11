import { useEffect, useRef } from "react";
import type { Listing } from "../../types/listing";
import type { SearchContext } from "../../types/search";
import { formatPrice } from "../../utils/catalogue";
import Icon from "../Icon";

export default function DemoBookingDialog({
  listing,
  search,
  onClose,
}: {
  listing: Listing;
  search: SearchContext;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="booking-dialog"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-boundary"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])",
          ),
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="dialog-close"
        aria-label="Close demo confirmation"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <div className="confirmation-mark" aria-hidden="true">
        <Icon name="leaf" size={30} />
      </div>
      <p className="eyebrow">JUST A LITTLE DAYDREAM</p>
      <h2 id="confirmation-title">Your demo confirmation</h2>
      <p id="confirmation-boundary" className="notice">
        Demo confirmation only. Nothing has been reserved or charged.
      </p>
      <h3>{listing.title}</h3>
      <dl className="confirmation-facts">
        <div>
          <dt>Destination</dt>
          <dd>{listing.location}</dd>
        </div>
        <div>
          <dt>Dates</dt>
          <dd>
            {search.checkIn && search.checkOut
              ? `${search.checkIn} → ${search.checkOut}`
              : "Not selected"}
          </dd>
        </div>
        <div>
          <dt>Travelers</dt>
          <dd>{search.travelers}</dd>
        </div>
        <div>
          <dt>Example base price</dt>
          <dd>
            {formatPrice(listing.price)} / {listing.priceUnit}
          </dd>
        </div>
      </dl>
      <p className="muted">
        No availability was checked. No booking or personal details are saved.
        This example is not a reservation reference.
      </p>
      <button className="button primary" onClick={onClose}>
        Keep exploring <Icon name="arrow" size={18} />
      </button>
    </dialog>
  );
}
