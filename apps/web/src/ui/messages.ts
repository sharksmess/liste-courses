/** Messages affiches pour les codes d'erreur des contrats (jamais de detail technique). */
const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Adresse e-mail invalide.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit faire au moins 8 caracteres.",
  PASSWORD_TOO_LONG: "Le mot de passe doit faire au plus 128 caracteres.",
  VALIDATION_FAILED: "Valeur invalide : verifiez la longueur du champ.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe deja avec cette adresse.",
  INVALID_EMAIL_OR_PASSWORD: "Adresse ou mot de passe incorrect.",
  ALREADY_IN_HOUSEHOLD: "Vous appartenez deja a un foyer.",
  INVITE_CODE_INVALID: "Ce code n'est pas valide. Verifiez-le et reessayez.",
  ITEM_NOT_FOUND: "Cet article n'existe plus : la liste vient d'etre mise a jour.",
  ITEM_LIMIT_REACHED: "La liste est pleine : supprimez un article pour en ajouter un.",
  HOUSEHOLD_FULL: "Ce foyer est complet : il compte deja 10 membres.",
  NO_HOUSEHOLD: "Vous ne faites plus partie de ce foyer.",
  MEMBER_NOT_FOUND: "Ce membre ne fait plus partie du foyer : la liste vient d'etre mise a jour.",
  OWNER_CANNOT_BE_REMOVED: "La responsable ne peut pas etre retiree du foyer.",
  OWNER_CANNOT_LEAVE: "La responsable ne peut pas quitter le foyer.",
  UNAUTHENTICATED: "Votre session a expire. Reconnectez-vous.",
  NETWORK: "Le serveur est injoignable. Reessayez.",
};

export function messageFor(status: number, code: string | null): string {
  if (status === 429) return "Trop de tentatives. Patientez quelques secondes.";
  return (code && MESSAGES[code]) ?? "Une erreur est survenue. Reessayez.";
}

/**
 * Message du formulaire « rejoindre » : un code mal forme (422) recoit le meme
 * message neutre qu'un code refuse, le message de validation parlant de longueur.
 */
export function joinErrorMessage(status: number, code: string | null): string {
  if (status === 422 && code === "VALIDATION_FAILED") return messageFor(404, "INVITE_CODE_INVALID");
  return messageFor(status, code);
}

interface MutationOutcome {
  ok: boolean;
  status: number;
  code: string | null;
}

interface MutationEffect {
  refresh: boolean;
  message: string | null;
}

function mutationEffect(outcome: MutationOutcome, staleCodes: readonly string[]): MutationEffect {
  if (outcome.ok) return { refresh: true, message: null };
  return { refresh: outcome.code !== null && staleCodes.includes(outcome.code), message: messageFor(outcome.status, outcome.code) };
}

/**
 * Suite d'une mutation de la liste. Sur ITEM_NOT_FOUND (article supprime par un
 * autre membre) ou NO_HOUSEHOLD (compte retire du foyer, le rechargement mene a
 * « sans foyer »), le message s'affiche et la page est rechargee ; toute autre
 * erreur laisse la liste en l'etat.
 */
export function itemMutationEffect(outcome: MutationOutcome): MutationEffect {
  return mutationEffect(outcome, ["ITEM_NOT_FOUND", "NO_HOUSEHOLD"]);
}

/**
 * Suite d'un retrait ou d'un depart. Quand la page est perimee (membre deja
 * parti, compte retire, role qui ne correspond plus a l'ecran), le message
 * s'affiche et la page est rechargee ; toute autre erreur laisse l'ecran en l'etat.
 */
export function memberMutationEffect(outcome: MutationOutcome): MutationEffect {
  return mutationEffect(outcome, ["MEMBER_NOT_FOUND", "NO_HOUSEHOLD", "INSUFFICIENT_ROLE"]);
}
