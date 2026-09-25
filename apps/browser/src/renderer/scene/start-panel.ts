/**
 * The new-tab start panel: a search box, then bookmarks and recent
 * history. Bookmarks and history arrive in milestone 3, so both show the
 * empty state for now.
 */
export class StartPanel {
  readonly element: HTMLDivElement;
  private readonly input: HTMLInputElement;

  constructor(onSubmit: (text: string) => void) {
    this.element = document.createElement('div');
    this.element.className = 'hs-start';
    this.element.dataset['testid'] = 'start-panel';

    const title = document.createElement('h1');
    title.textContent = 'HyperSol WebSurfer 3D';

    const form = document.createElement('form');
    form.className = 'hs-start-search';
    form.setAttribute('role', 'search');
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.placeholder = 'Search the web or type an address';
    this.input.setAttribute('aria-label', 'Search the web or type an address');
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.dataset['testid'] = 'start-search';
    form.append(this.input);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.input.value.trim();
      if (text !== '') onSubmit(text);
    });

    this.element.append(
      title,
      form,
      section('Bookmarks', 'Pages you bookmark will show up here.'),
      section('Recent', 'Pages you visit will show up here.'),
    );
  }

  focus(): void {
    this.input.focus();
  }
}

function section(name: string, hint: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'hs-start-section';
  const heading = document.createElement('h2');
  heading.textContent = name;
  const empty = document.createElement('p');
  empty.className = 'hs-empty';
  empty.textContent = 'Nothing saved yet';
  const hintEl = document.createElement('p');
  hintEl.className = 'hs-empty-hint';
  hintEl.textContent = hint;
  el.append(heading, empty, hintEl);
  return el;
}
