/**
 * Point d'import unique des contrats d'API (ADR-0006) : les Route Handlers et
 * la configuration better-auth valident avec ces schemas, jamais avec une copie.
 */
export { signUp } from "../../../../docs/02-architecture/api-contracts/auth";
export { createHousehold, getMe, joinHousehold } from "../../../../docs/02-architecture/api-contracts/household";
export { getInviteCode, regenerateInviteCode } from "../../../../docs/02-architecture/api-contracts/invite-code";
export { leaveHousehold, listMembers, removeMember } from "../../../../docs/02-architecture/api-contracts/members";
export { addItem, deleteItem, listItems, setItemPurchased } from "../../../../docs/02-architecture/api-contracts/items";
