/** Messages affiches pour les codes d'erreur des contrats (jamais de detail technique). */
const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Adresse e-mail invalide.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit faire au moins 8 caracteres.",
  PASSWORD_TOO_LONG: "Le mot de passe doit faire au plus 128 caracteres.",
  VALIDATION_FAILED: "Valeur invalide : verifiez la longueur du champ.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe deja avec cette adresse.",
  INVALID_EMAIL_OR_PASSWORD: "Adresse ou mot de passe incorrect.",
  ALREADY_IN_HOUSEHOLD: "Vous appartenez deja a un foyer.",
  UNAUTHENTICATED: "Votre session a expire. Reconnectez-vous.",
  NETWORK: "Le serveur est injoignable. Reessayez.",
};

export function messageFor(status: number, code: string | null): string {
  if (status === 429) return "Trop de tentatives. Patientez quelques secondes.";
  return (code && MESSAGES[code]) ?? "Une erreur est survenue. Reessayez.";
}
