/**
 * Point d'import unique des contrats d'API (ADR-0006) : les Route Handlers et
 * la configuration better-auth valident avec ces schemas, jamais avec une copie.
 */
export { signUp } from "../../../../docs/02-architecture/api-contracts/auth";
export { createHousehold, getMe } from "../../../../docs/02-architecture/api-contracts/household";
