'use strict';
const MEDICATION_CLASSES = {
  antipsychotics: {
    name: 'Antipsychotics',
    isHighAlert: true,
    isPsychotropic: true,
    isAntipsychotic: true,
    drugs: [
      // Second Generation (Atypical)
      { generic: 'quetiapine', brands: ['seroquel', 'seroquel xr'] },
      { generic: 'risperidone', brands: ['risperdal', 'perseris'] },
      { generic: 'olanzapine', brands: ['zyprexa', 'zyprexa zydis', 'relprevv'] },
      { generic: 'aripiprazole', brands: ['abilify', 'abilify maintena', 'aristada'] },
      { generic: 'ziprasidone', brands: ['geodon'] },
      { generic: 'lurasidone', brands: ['latuda'] },
      { generic: 'brexpiprazole', brands: ['rexulti'] },
      { generic: 'cariprazine', brands: ['vraylar'] },
      { generic: 'paliperidone', brands: ['invega', 'invega sustenna', 'invega trinza', 'invega hafyera'] },
      { generic: 'clozapine', brands: ['clozaril', 'fazaclo', 'versacloz'] },
      { generic: 'lumateperone', brands: ['caplyta'] },
      { generic: 'asenapine', brands: ['saphris', 'secuado'] },
      { generic: 'pimavanserin', brands: ['nuplazid'] },
      // First Generation (Typical)
      { generic: 'haloperidol', brands: ['haldol', 'haldol decanoate'] },
      { generic: 'chlorpromazine', brands: ['thorazine'] },
      { generic: 'prochlorperazine', brands: ['compazine'] }, // Flag for review if ordered as psych vs antiemetic
      { generic: 'fluphenazine', brands: ['prolixin', 'prolixin decanoate'] },
      { generic: 'perphenazine', brands: ['trilafon'] },
      { generic: 'thiothixene', brands: ['navane'] },
      { generic: 'thioridazine', brands: ['mellaril'] },
      { generic: 'trifluoperazine', brands: ['stelazine'] },
      { generic: 'loxapine', brands: ['loxitane', 'adasuve'] },
    ]
  },
  antidepressants: {
    name: 'Antidepressants',
    isHighAlert: false,
    isPsychotropic: true,
    drugs: [
      { generic: 'sertraline', brands: ['zoloft'] },
      { generic: 'escitalopram', brands: ['lexapro'] },
      { generic: 'citalopram', brands: ['celexa'] },
      { generic: 'fluoxetine', brands: ['prozac'] },
      { generic: 'paroxetine', brands: ['paxil'] },
      { generic: 'mirtazapine', brands: ['remeron'] },
      { generic: 'venlafaxine', brands: ['effexor', 'effexor xr'] },
      { generic: 'duloxetine', brands: ['cymbalta'] },
      { generic: 'bupropion', brands: ['wellbutrin', 'wellbutrin xl', 'wellbutrin sr'] },
      { generic: 'trazodone', brands: ['desyrel'] },
    ]
  },
  anxiolytics_hypnotics: {
    name: 'Anxiolytics & Hypnotics (Sedatives)',
    isHighAlert: true,
    isPsychotropic: true,
    drugs: [
      { generic: 'lorazepam', brands: ['ativan'] },
      { generic: 'alprazolam', brands: ['xanax'] },
      { generic: 'clonazepam', brands: ['klonopin'] },
      { generic: 'diazepam', brands: ['valium'] },
      { generic: 'temazepam', brands: ['restoril'] },
      { generic: 'oxazepam', brands: ['serax'] },
      { generic: 'zolpidem', brands: ['ambien', 'ambien cr'] },
      { generic: 'eszopiclone', brands: ['lunesta'] },
      { generic: 'zaleplon', brands: ['sonata'] },
      { generic: 'buspirone', brands: ['buspar'] },
      { generic: 'hydroxyzine', brands: ['vistaril', 'atarax'] },
    ]
  },
  anticoagulants: {
    name: 'Anticoagulants & Antiplatelets',
    isHighAlert: true,
    drugs: [
      { generic: 'apixaban', brands: ['eliquis'] },
      { generic: 'rivaroxaban', brands: ['xarelto'] },
      { generic: 'warfarin', brands: ['coumadin', 'jantoven'] },
      { generic: 'enoxaparin', brands: ['lovenox'] },
      { generic: 'heparin', brands: ['heparin sodium'] },
      { generic: 'dabigatran', brands: ['pradaxa'] },
      { generic: 'clopidogrel', brands: ['plavix'] },
    ]
  },
  insulins_hypoglycemics: {
    name: 'Insulin & High-Risk Hypoglycemic Therapy',
    isHighAlert: true,
    drugs: [
      { generic: 'insulin glargine', brands: ['lantus', 'basaglar', 'toujeo'] },
      { generic: 'insulin lispro', brands: ['humalog', 'admelog'] },
      { generic: 'insulin aspart', brands: ['novolog', 'fiasp'] },
      { generic: 'insulin detemir', brands: ['levemir'] },
      { generic: 'insulin regular', brands: ['humulin r', 'novolin r'] },
      { generic: 'glipizide', brands: ['glucotrol', 'glucotrol xl'] },
      { generic: 'glimepiride', brands: ['amaryl'] },
      { generic: 'glyburide', brands: ['diabeta', 'micronase'] },
    ]
  },
  opioids: {
    name: 'Opioids & Controlled Pain Analgesics',
    isHighAlert: true,
    drugs: [
      { generic: 'oxycodone', brands: ['roxyicodone', 'oxycontin', 'percocet'] },
      { generic: 'hydrocodone', brands: ['norco', 'vicodin', 'lortab'] },
      { generic: 'morphine', brands: ['ms contin', 'roxanol'] },
      { generic: 'hydromorphone', brands: ['dilaudid'] },
      { generic: 'fentanyl', brands: ['duragesic'] },
      { generic: 'tramadol', brands: ['ultram'] },
      { generic: 'methadone', brands: ['dolophine'] },
    ]
  },
  antibiotics: {
    name: 'Systemic Antibiotics & Antimicrobials',
    isHighAlert: true,
    drugs: [
      { generic: 'amoxicillin/clavulanate', brands: ['augmentin'] },
      { generic: 'amoxicillin', brands: ['amoxil'] },
      { generic: 'ciprofloxacin', brands: ['cipro'] },
      { generic: 'levofloxacin', brands: ['levaquin'] },
      { generic: 'ceftriaxone', brands: ['rocephin'] },
      { generic: 'cephalexin', brands: ['keflex'] },
      { generic: 'cefuroxime', brands: ['ceftin'] },
      { generic: 'sulfamethoxazole/trimethoprim', brands: ['bactrim', 'septra'] },
      { generic: 'nitrofurantoin', brands: ['macrobid', 'macrodantin'] },
      { generic: 'doxycycline', brands: ['vibramycin'] },
      { generic: 'azithromycin', brands: ['zithromax', 'z-pak'] },
      { generic: 'vancomycin', brands: ['vancocin'] },
      { generic: 'piperacillin/tazobactam', brands: ['zosyn'] },
    ]
  }
};

// Target behaviors and symptoms recognized in clinical surveillance
const TARGET_BEHAVIORS = [
  'physical aggression', 'hitting', 'kicking', 'scratching', 'biting', 'combative',
  'verbal aggression', 'screaming', 'cursing', 'threats', 'shouting',
  'hallucinations', 'auditory hallucinations', 'visual hallucinations',
  'delusions', 'paranoia', 'paranoid ideation',
  'severe agitation', 'pacing with distress', 'repetitive verbal distress',
  'resistance to care', 'combative with adls', 'refusing essential care with distress',
  'self-injurious behavior', 'head banging',
  'sexual disinhibition', 'wandering with distress', 'exit-seeking with panic'
];

// Non-pharmacological interventions recognized in clinical surveillance
const NON_PHARM_INTERVENTIONS = [
  'redirection', 'verbal reassurance', 'calm voice',
  'environmental modification', 'dim lights', 'quiet room', 'noise reduction', 'change in setting',
  'activity modification', 'music therapy', 'snack provided', 'warm beverage', 'aromatherapy',
  'pain assessment', 'toileting assistance', 'positioning', 'walking assistance',
  'family contact', 'photo album', '1:1 engagement', 'time away from group',
  'sleep hygiene', 'gentle approach', 'allowing cooling off period', 'choice offered'
];

/**
 * Matches a drug name to drug classification dictionary
 */
function identifyMedication(drugText) {
  if (!drugText || typeof drugText !== 'string') {
    return { isHighAlert: false, isPsychotropic: false, isAntipsychotic: false, drugClass: 'Other' };
  }
  const clean = drugText.toLowerCase().replace(/[^a-z0-9\s/]/g, ' ');
  for (const [classKey, category] of Object.entries(MEDICATION_CLASSES)) {
    for (const d of category.drugs) {
      if (clean.includes(d.generic) || d.brands.some(b => clean.includes(b))) {
        return {
          matchedGeneric: d.generic,
          drugClass: category.name,
          classKey,
          isHighAlert: !!category.isHighAlert,
          isPsychotropic: !!category.isPsychotropic,
          isAntipsychotic: !!category.isAntipsychotic,
        };
      }
    }
  }
  return { isHighAlert: false, isPsychotropic: false, isAntipsychotic: false, drugClass: 'Standard' };
}


module.exports={MEDICATION_CLASSES,TARGET_BEHAVIORS,NON_PHARM_INTERVENTIONS,identifyMedication};
