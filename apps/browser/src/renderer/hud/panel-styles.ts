import { css } from 'lit';

/** Shared look of the slide-in panels (Library, Settings). */
export const panelStyles = css`
  :host {
    position: fixed;
    top: 64px;
    right: 24px;
    bottom: 24px;
    z-index: 15;
    width: min(400px, calc(100vw - 48px));
    display: block;
    transform: translateX(calc(100% + 40px));
    visibility: hidden;
    transition:
      transform 250ms ease,
      visibility 0s linear 250ms;
  }
  :host([open]) {
    transform: none;
    visibility: visible;
    transition: transform 250ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    :host,
    :host([open]) {
      transition: none;
    }
  }
  section {
    box-sizing: border-box;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 18px 14px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--hs-accent) 45%, transparent);
    background: color-mix(in srgb, var(--hs-panel-glass) 94%, transparent);
    color: var(--hs-text);
    box-shadow:
      0 12px 40px rgb(0 0 0 / 50%),
      0 0 calc(30px * var(--hs-glow-strength)) color-mix(in srgb, var(--hs-accent) 25%, transparent);
    font-size: 14px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--hs-text-muted);
  }
  button,
  input,
  select {
    font: inherit;
    color: inherit;
  }
  button {
    cursor: pointer;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--hs-accent) 55%, transparent);
    background: transparent;
    padding: 5px 12px;
  }
  button:hover {
    background: color-mix(in srgb, var(--hs-accent) 16%, transparent);
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--hs-accent);
    outline-offset: 2px;
  }
  .icon-button {
    border: 0;
    width: 30px;
    height: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    font-size: 18px;
    line-height: 1;
  }
  .danger {
    border-color: #ff8a65;
  }
  .muted {
    color: var(--hs-text-muted);
  }
  .empty {
    margin: 18px 0 2px;
    font-size: 15px;
  }
  .error {
    margin: 18px 0;
    color: #ffb199;
  }
  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    background: color-mix(in srgb, #ff8a65 12%, transparent);
  }
  .confirm p {
    margin: 0;
    flex-basis: 100%;
  }
`;
