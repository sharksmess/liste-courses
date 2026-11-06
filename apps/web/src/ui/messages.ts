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

/**
 * Suite d'une mutation de la liste. Sur ITEM_NOT_FOUND (article supprime par un
 * autre membre), le message s'affiche et la page est rechargee ; toute autre
 * erreur laisse la liste en l'etat.
 */
export function itemMutationEffect(outcome: { ok: boolean; status: number; code: string | null }): {
  refresh: boolean;
  message: string | null;
} {
  if (outcome.ok) return { refresh: true, message: null };
  return { refresh: outcome.code === "ITEM_NOT_FOUND", message: messageFor(outcome.status, outcome.code) };
}
