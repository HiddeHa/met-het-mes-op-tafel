export interface Question {
  category: string;
  question: string;
  acceptableAnswers: string[];
}

export const QUESTION_BANK: Question[] = [
  {
    category: "Films",
    question: "Noem de titel van de filmserie met een Teenage Mutant Ninja Turtles",
    acceptableAnswers: ["Teenage Mutant Ninja Turtles"],
  },
  {
    category: "Films",
    question: "Welke acteur speelde Jack in de film 'Titanic'?",
    acceptableAnswers: ["Leonardo DiCaprio", "Leo DiCaprio"],
  },
  {
    category: "Films",
    question: "In welke film zegt Darth Vader: 'Ik ben je vader'?",
    acceptableAnswers: ["Star Wars: Episode V - The Empire Strikes Back", "The Empire Strikes Back", "Star Wars 5"],
  },
  {
    category: "Muziek",
    question: "Wie zingt de tekst: 'Money money money, altijd moet ik geld betalen'?",
    acceptableAnswers: ["ABBA"],
  },
  {
    category: "Muziek",
    question: "Wat is de naam van de zanger van de band Queen?",
    acceptableAnswers: ["Freddie Mercury"],
  },
  {
    category: "Muziek",
    question: "Welk Nederlands nummer begint met de tekst: 'Ik wil dat we dansen tot de zon opkomt'?",
    acceptableAnswers: ["Dansen tot de zon opkomt", "Sander van Doorn & Robbie Williams"],
  },
  {
    category: "Geografie",
    question: "In welk land vind je de stad Santiago de Compostela?",
    acceptableAnswers: ["Spanje"],
  },
  {
    category: "Geografie",
    question: "Wat is de hoofdstad van Noorwegen?",
    acceptableAnswers: ["Oslo"],
  },
  {
    category: "Geografie",
    question: "Welke rivier stroomt door Egypte en is de langste rivier ter wereld?",
    acceptableAnswers: ["Niël", "Nile"],
  },
  {
    category: "Geschiedenis",
    question: "In welk jaar viel de Berlijnse Muur?",
    acceptableAnswers: ["1989"],
  },
  {
    category: "Geschiedenis",
    question: "In welk jaar landde de eerste mens op de maan?",
    acceptableAnswers: ["1969"],
  },
  {
    category: "Geschiedenis",
    question: "Wie was de eerste president van de Verenigde Staten?",
    acceptableAnswers: ["George Washington"],
  },
  {
    category: "Wetenschap",
    question: "Wie ontdekte de zwaartekracht?",
    acceptableAnswers: ["Newton", "Isaac Newton"],
  },
  {
    category: "Wetenschap",
    question: "Wat is het chemische teken voor goud?",
    acceptableAnswers: ["Au"],
  },
  {
    category: "Wetenschap",
    question: "Hoeveel botten heeft een volwassen mens gemiddeld?",
    acceptableAnswers: ["206"],
  },
  {
    category: "Eten en drinken",
    question: "Van welke plant komt suiker voornamelijk?",
    acceptableAnswers: ["suikerriet", "riet", "suikerbiet", "biet"],
  },
  {
    category: "Eten en drinken",
    question: "Wat is het hoofdingrediënt van traditionele Nederlandse erwtensoep?",
    acceptableAnswers: ["spliterwten", "erwtensoep", "snert"],
  },
  {
    category: "Eten en drinken",
    question: "Welke kaas staat bekend om zijn gaten en komt uit Zwitserland?",
    acceptableAnswers: ["Emmentaler", "Emmenthal", "Swiss cheese"],
  },
  {
    category: "Sport",
    question: "Hoe heten de hobbels op een schaatsbaan in het Fries?",
    acceptableAnswers: ["kupers"],
  },
  {
    category: "Sport",
    question: "Hoelang duurt een officiële voetbalwedstrijd (zonder blessuretijd)?",
    acceptableAnswers: ["90 minuten", "1,5 uur"],
  },
  {
    category: "Sport",
    question: "In welke sport gebruik je een shuttlecock?",
    acceptableAnswers: ["Badminton"],
  },
  {
    category: "Taal",
    question: "Wat is een synoniem van het woord 'onverzonnen'?",
    acceptableAnswers: ["echt", "waar", "waarheid", "authentiek"],
  },
  {
    category: "Taal",
    question: "Wat betekent het Nederlandse woord 'gezellig' het beste in het Engels?",
    acceptableAnswers: ["cozy", "pleasant", "nice atmosphere"],
  },
  {
    category: "Taal",
    question: "Welk lidwoord hoort bij het woord 'boek' (de/het)?",
    acceptableAnswers: ["het"],
  },
  {
    category: "Reizen",
    question: "Naar welk eiland in de Stille Oceaan reizen de meeste toeristen?",
    acceptableAnswers: ["Bali", "Java", "Hawaii"],
  },
  {
    category: "Reizen",
    question: "Wat is de hoofdstad van Australië?",
    acceptableAnswers: ["Canberra"],
  },
  {
    category: "Reizen",
    question: "Welke Europese stad staat bekend als de 'Stad van de Liefde'?",
    acceptableAnswers: ["Parijs", "Paris"],
  },
  {
    category: "Kunst",
    question: "Van wie is het schilderij 'De Jordaansche boer'?",
    acceptableAnswers: ["Vincent van Gogh", "Van Gogh", "Vincent"],
  },
  {
    category: "Kunst",
    question: "Wie schilderde het beroemde werk 'De Nachtwacht'?",
    acceptableAnswers: ["Rembrandt van Rijn", "Rembrandt"],
  },
  {
    category: "Kunst",
    question: "In welk museum hangt de Mona Lisa?",
    acceptableAnswers: ["Louvre", "Louvre Museum"],
  },
];

export function getRandomQuestions(count: number): Question[] {
  const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
