import { useEffect } from 'react';

export function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Handleiding</p>
            <h2 id="rules-title">Zo werkt het mes</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </header>

        <div className="modal-body">
          <section>
            <h3>1 · Vier vragen</h3>
            <p>
              Elke ronde krijgt de tafel vier vragen uit verschillende
              categorieën. Iedereen begint met <strong>€ 750</strong> en betaalt
              vóór de vragen een verplichte inzet: <strong>€ 10</strong> in
              ronde 1, <strong>€ 20</strong> in ronde 2, <strong>€ 40</strong> in
              ronde 3 en <strong>€ 80</strong> vanaf ronde 4. Die inzet staat
              meteen in de pot.
            </p>
            <p>
              Je vult alle vier de antwoorden op één briefje in. Online vult
              iedereen tegelijk op zijn eigen scherm, met één klok voor de hele
              tafel; bij lokaal spel geef je het scherm door. Je briefje staat op
              slot zodra je op <strong>Briefje op slot</strong> drukt. Lege
              antwoorden tellen als fout.
            </p>
          </section>

          <section>
            <h3>2 · De antwoorden</h3>
            <p>
              Zodra alle briefjes op slot liggen, ziet de hele tafel de vier
              goede antwoorden. Je weet dus hoe je zelf deed — maar niet wat de
              anderen invulden. Die briefjes gaan pas na de inzetronde open.
            </p>
          </section>

          <section>
            <h3>3 · Inzetten</h3>
            <p>
              Na de onthulling van de antwoorden opent de inzetronde. De
              verplichte inzet is al betaald en staat op tafel; de eerste speler
              links van de deler kan <strong>verhogen of passen</strong>. Daarna
              kun je meegaan, verhogen met stappen van € 10 (maximaal € 50 bovenop de
              verplichte inzet) of passen. Elke extra inzet gaat direct van je bankroll naar de pot.
            </p>
            <ul>
              <li><strong>Call</strong> — je legt hetzelfde bedrag als de hoogste inzet.</li>
              <li><strong>Raise</strong> — je verhoogt de hoogste inzet met minimaal € 10.</li>
              <li><strong>Fold</strong> — je doet niet meer mee om de pot. Je inzet blijft liggen.</li>
            </ul>
            <p>
              Passen alle andere spelers, dan krijgt de laatste speler nog de
              kans om te verhogen of alsnog te passen.
            </p>
          </section>

          <section>
            <h3>4 · Onthullen</h3>
            <p>
              Na de inzetronde gaan alle briefjes open. De pot gaat naar de
              speler met de <strong>meeste goede antwoorden</strong> van de
              spelers die niet gepast hebben. Bij een gelijke stand wordt de pot
              verdeeld.
            </p>
            <p>
              Had geen van de overgebleven spelers een goed antwoord? Dan blijft
              de pot liggen en groeit hij door naar de volgende ronde. Wie past,
              kan de pot niet winnen — ook niet met vier goede antwoorden.
            </p>
          </section>

          <section>
            <h3>Shootout</h3>
            <p>
              Na de laatste ronde volgt de shootout. Iedereen ziet de vraag, de
              bel gaat open en wie het eerst buzzt mag antwoorden. Goed = € 100
              én de eventueel overgebleven pot. Fout = je ligt eruit en de
              anderen mogen opnieuw bellen. Bij een gelijke stand volgt nog een
              shootout.
            </p>
            <p className="modal-note">
              Toetsenbord: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> om te buzzen
              (per stoel), <kbd>Enter</kbd> om een inzet of shootoutantwoord te
              bevestigen. Het briefje gaat pas op slot met de knop.
            </p>
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn--gold" onClick={onClose}>
            Speel verder
          </button>
        </footer>
      </div>
    </div>
  );
}
