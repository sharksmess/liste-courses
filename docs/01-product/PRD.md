# PRD — Liste de courses familiale

Statut : en attente du gate PRD (`.\gates.ps1 approve-prd`, humain).
Sources : resume produit valide par l'humain et reponses du 2026-10-30 (D-008 a D-012). Hypotheses de redaction : D-013.

## Probleme et utilisateur cible
Utilisatrice principale : une mere de famille (deux enfants, un mari) qui organise les courses du foyer.

Aujourd'hui, la liste vit sur papier et dans des messages : le papier reste a la maison, les messages se perdent. Personne ne sait ce qui manque ni ce qui a deja ete achete.

Le produit donne au foyer **une seule liste partagee**. Chaque membre y ajoute ce qui manque, coche ce qu'il achete, et voit qui a demande quoi.

Contexte : c'est le second projet de l'objectif A de saas-factory. Il doit prouver que l'usine 1.6.5 demarre un projet sans etre modifiee. Le perimetre est donc volontairement minimal, et le produit n'est pas destine a une mise en ligne publique.

## Perimetre du MVP
- Comptes par adresse e-mail et mot de passe, avec un prenom d'affichage. L'adresse n'est jamais verifiee.
- Connexion et deconnexion. Les tentatives de connexion sont limitees.
- Creation d'un foyer (nom du foyer). La personne qui le cree en devient la responsable.
- Un code d'invitation par foyer, sans expiration. Seule la responsable le voit et le regenere.
- Rejoindre un foyer avec ce code.
- Une page « sans foyer » pour un compte sans foyer : creer un foyer ou en rejoindre un.
- Une liste unique par foyer : ajouter, cocher « achete », decocher et supprimer un article. Chaque article affiche le prenom de son auteur.
- Liste des membres du foyer.
- Retrait d'un membre par la responsable. Depart volontaire d'un membre.
- Bornes : 10 membres et 200 articles par foyer.
- Isolation stricte entre foyers.

## Hors-perimetre (explicite)
- Paiement, abonnement, offre payante : le produit est gratuit.
- Application mobile native. Seule une application web est prevue.
- Notifications, quelle qu'en soit la forme (e-mail, push, SMS).
- Tout envoi d'e-mail, y compris la verification d'adresse.
- Recuperation ou reinitialisation de mot de passe (risque R2).
- Changement de mot de passe, d'adresse e-mail ou de prenom d'affichage.
- Suppression de compte et droit a l'effacement RGPD (risque R1).
- Age minimum et consentement parental pour les mineurs (risque R1).
- Plusieurs listes par foyer, et appartenance a plusieurs foyers.
- Mise a jour instantanee : on recharge la page pour voir les changements des autres.
- Historique des courses, et restauration d'un article supprime.
- Transfert du role de responsable, depart de la responsable, suppression du foyer.
- Renommage du foyer.
- Modification d'un article existant (nom, quantite). On le supprime puis on le recree.
- Expiration du code d'invitation, et invitation par lien ou par e-mail.
- Categories, rayons, tri personnalise, recherche dans la liste.
- Plus d'un role en dehors de responsable et membre.

## Unite de compte et modele de roles
**Unite de compte : le foyer.** C'est lui qui est isole, comme un tenant. Toutes les donnees de liste et de membres appartiennent a un foyer.

- Un utilisateur appartient a **au plus un** foyer. Un compte peut exister sans foyer : en attente d'un code, apres un retrait ou apres un depart.
- Un foyer compte 10 membres au plus, responsable comprise.
- Un foyer a exactement une responsable, celle qui l'a cree. Ce role ne change jamais dans le MVP.

| Action | Responsable (owner) | Membre (member) | Compte sans foyer |
|---|---|---|---|
| Voir la liste et les membres de son foyer | oui | oui | non |
| Ajouter, cocher, decocher, supprimer n'importe quel article | oui | oui | non |
| Voir le code d'invitation | oui | non (D-013) | non |
| Regenerer le code d'invitation | oui | non | non |
| Retirer un membre | oui (sauf elle-meme) | non | non |
| Quitter le foyer | non | oui | sans objet |
| Creer un foyer, rejoindre un foyer par code | non (a deja un foyer) | non (a deja un foyer) | oui |

## Modele de revenu et evenements factures
Aucun : le produit est gratuit. Il n'y a ni facturation, ni comptage d'usage, ni evenement facture (D-001 : socle sans facturation).

## User stories
Conventions communes a toutes les stories :
- Les champs texte sont compares a leurs bornes **apres retrait des espaces de bord**.
- Les longueurs sont comptees en caracteres.
- Une requete refusee ne cree, ne modifie et ne supprime rien.

### US-01 — Creer un compte
En tant que personne du foyer, je cree un compte avec mon adresse e-mail, un mot de passe et mon prenom.
1. Une inscription avec une adresse e-mail valide, un mot de passe de 8 a 128 caracteres et un prenom de 1 a 30 caracteres cree le compte et ouvre une session.
2. Un mot de passe de moins de 8 caracteres ou de plus de 128 caracteres est refuse avec un message explicite, et aucun compte n'est cree.
3. Un prenom vide (ou fait uniquement d'espaces), ou de plus de 30 caracteres, est refuse, et aucun compte n'est cree.
4. Le prenom est enregistre sans ses espaces de bord.
5. Une adresse deja utilisee par un compte est refusee, et aucun second compte n'est cree (D-013).
6. Une adresse mal formee est refusee.
7. Aucun e-mail n'est envoye a l'inscription.
8. Juste apres l'inscription, le compte n'appartient a aucun foyer et voit la page « sans foyer » (US-04).

### US-02 — Se connecter et se deconnecter
1. Une adresse et un mot de passe corrects ouvrent une session.
2. Un mot de passe faux ou une adresse inconnue sont refuses avec le meme message, qui ne revele pas si l'adresse existe.
3. Hors environnement de test, les tentatives de connexion repetees sont limitees par le limiteur integre du module d'authentification : au-dela du seuil, la tentative est refusee meme avec le bon mot de passe.
4. La deconnexion ferme la session. Une requete faite ensuite avec l'ancienne session est refusee comme non authentifiee.
5. Toute page ou action du foyer demandee sans session est refusee comme non authentifiee.

### US-03 — Creer un foyer
En tant que compte sans foyer, je cree mon foyer et j'en deviens la responsable.
1. Un compte sans foyer qui cree un foyer avec un nom de 1 a 50 caracteres en devient la responsable, et c'en est le seul membre.
2. Un nom de foyer vide, ou de plus de 50 caracteres, est refuse.
3. A sa creation, le foyer a un code d'invitation valide et une liste vide.
4. Un compte qui appartient deja a un foyer ne peut pas en creer un autre : la demande est refusee.

### US-04 — Page « sans foyer »
1. Un compte connecte sans foyer voit une page qui propose deux actions : creer un foyer (US-03) et rejoindre un foyer avec un code (US-05).
2. Ce compte n'a acces ni a une liste ni a des membres. Toute requete sur la liste ou les membres est refusee.

### US-05 — Rejoindre un foyer avec un code
En tant que compte sans foyer, je rejoins le foyer de ma famille avec le code qu'on m'a donne de vive voix.
1. Avec le code en vigueur d'un foyer qui compte moins de 10 membres, le compte rejoint ce foyer comme membre et voit sa liste.
2. Un code inconnu, ou un code remplace par une regeneration (US-11), est refuse. Le message ne revele rien d'un foyer.
3. Si le foyer compte deja 10 membres, la demande est refusee avec un message explicite, et le nombre de membres reste 10.
4. Un compte qui appartient deja a un foyer ne peut pas en rejoindre un autre : la demande est refusee.
5. Rejoindre exige un compte connecte. Sans session, la demande est refusee comme non authentifiee.

### US-06 — Voir la liste
1. Un membre ou la responsable voit tous les articles de son foyer. Pour chacun : le nom, la quantite si elle existe, l'etat « achete » ou non, et le prenom de l'auteur.
2. Un article ajoute par une personne qui a depuis quitte le foyer, ou en a ete retiree, affiche toujours le prenom de cette personne.
3. Aucun article d'un autre foyer n'apparait, jamais.
4. Les articles sont affiches dans leur ordre d'ajout (D-013).
5. La liste montre l'etat enregistre au moment du chargement. Les changements des autres membres apparaissent au rechargement.

### US-07 — Ajouter un article
1. Un membre ajoute un article avec un nom de 1 a 100 caracteres et, s'il le souhaite, une quantite libre de 1 a 30 caracteres. L'article apparait non coche, et la personne en est l'auteur.
2. Un nom vide, ou de plus de 100 caracteres, est refuse.
3. Une quantite de plus de 30 caracteres est refusee. Une quantite vide (ou faite uniquement d'espaces) est enregistree comme absente (D-013).
4. Deux articles du meme nom sont autorises.
5. Si le foyer compte deja 200 articles, coches compris, l'ajout est refuse avec un message explicite, et le nombre d'articles reste 200.

### US-08 — Cocher et decocher un article
1. Un membre coche un article non coche de son foyer : l'article passe a « achete ».
2. Un membre decoche un article coche de son foyer : l'article redevient « a acheter ».
3. N'importe quel membre peut cocher ou decocher n'importe quel article du foyer, quel qu'en soit l'auteur.
4. Une action sur un article d'un autre foyer est refusee, et l'article n'est pas modifie.

### US-09 — Supprimer un article
1. Un membre supprime n'importe quel article de son foyer, quel qu'en soit l'auteur. L'article disparait de la liste.
2. Une suppression visant un article d'un autre foyer est refusee, et l'article existe toujours.
3. Une suppression libere une place sous la borne des 200 articles.

### US-10 — Voir les membres du foyer
1. Un membre ou la responsable voit le prenom de chaque membre de son foyer, et qui est la responsable.
2. Les adresses e-mail des membres ne sont pas affichees (D-013).
3. Aucun membre d'un autre foyer n'apparait, jamais.

### US-11 — Voir et regenerer le code d'invitation
1. La responsable voit le code d'invitation en vigueur de son foyer.
2. Un membre qui n'est pas la responsable ne peut pas obtenir le code : la demande est refusee (D-013).
3. La responsable regenere le code : un nouveau code est en vigueur, et l'ancien est refuse a toute tentative ulterieure (US-05.2).
4. Un membre qui n'est pas la responsable ne peut pas regenerer le code : la demande est refusee, et le code reste inchange.
5. Le code ne permet de rejoindre que le foyer qui l'a emis.

### US-12 — Retirer un membre
1. La responsable retire un membre de son foyer. Ce compte n'a alors plus de foyer : a sa requete suivante, il voit la page « sans foyer » et n'a plus acces a la liste.
2. Les articles ajoutes par la personne retiree restent dans la liste, avec son prenom.
3. La responsable ne peut pas se retirer elle-meme : la demande est refusee.
4. Un membre qui n'est pas la responsable ne peut retirer personne : la demande est refusee.
5. Une demande visant une personne d'un autre foyer est refusee, et cette personne reste dans son foyer.
6. Une personne retiree peut ensuite creer un foyer ou en rejoindre un, y compris celui qu'elle a quitte si elle en a le code en vigueur.

### US-13 — Quitter le foyer
1. Un membre qui n'est pas la responsable quitte le foyer. Il n'a alors plus de foyer et voit la page « sans foyer ».
2. Les articles qu'il a ajoutes restent dans la liste, avec son prenom.
3. La responsable ne peut pas quitter le foyer : la demande est refusee.

## Contraintes non fonctionnelles
- **Charge** : quelques foyers de demonstration, 10 personnes et 200 articles par foyer au plus. Aucune exigence de montee en charge.
- **Latence** : aucune cible chiffree. Le volume borne rend une page de liste triviale.
- **Disponibilite** : aucune exigence. Le produit n'est pas mis en ligne (D-011).
- **Fraicheur** : pas de temps reel. L'etat affiche est celui du chargement de la page.
- **Retention** : les donnees sont conservees sans limite de duree. Le MVP ne prevoit aucune suppression de compte ni de foyer.
- **Isolation** : toute lecture et toute ecriture de liste, d'article, de membre ou de code est restreinte au foyer de l'utilisateur. Une requete qui vise une ressource d'un autre foyer est refusee sans renvoyer aucune donnee de cet autre foyer.
- **Securite des comptes** :
  - Mot de passe de 8 a 128 caracteres, jamais stocke en clair.
  - Connexion limitee par le limiteur integre du module d'authentification retenu (D-003), actif hors tests. C'est le meme choix que l'ADR-0010 du projet Signet.
- **Reglementation** : RGPD et donnees de mineurs non traites dans le MVP (risque R1). C'est acceptable uniquement parce que le produit n'est pas ouvert au public.
- **Hebergement, delai, budget** : aucune contrainte (D-011).

## Risques
| # | Risque | Signal d'alerte precoce | Reponse prevue |
|---|---|---|---|
| R1 | **Bloquant pour toute mise en ligne reelle.** Pas de suppression de compte ni de droit a l'effacement RGPD. Pas d'age minimum ni de consentement parental, alors que des enfants ont leur propre compte. | Toute demande d'ouvrir le produit a des personnes hors du cercle de test. | Une mise en ligne exige d'abord un PRD complementaire (effacement, mineurs, mentions legales). Elle est hors de l'objectif actuel. |
| R2 | Mot de passe oublie : le compte est perdu sans recours. Il n'y a ni recuperation ni changement de mot de passe. | Un membre de test qui ne peut plus se connecter. | Le membre cree un nouveau compte et rejoint le foyer avec le code. Ses anciens articles gardent son prenom. Aucune procedure de reprise dans le MVP. |
| R3 | Le code d'invitation n'expire jamais. S'il fuit, une personne exterieure peut rejoindre le foyer, et l'adresse n'etant pas verifiee, elle ne laisse pas de trace d'identite. | Un prenom inconnu dans la liste des membres, ou un article d'un auteur inconnu. | La responsable regenere le code (US-11) et retire l'intrus (US-12). La borne de 10 membres limite l'exposition. |

## Hypotheses prises
Hypotheses de redaction, consignees sous D-013. Chacune est a confirmer ou corriger a la relecture du gate PRD.

1. **Code visible par la responsable seule** (US-11.1, US-11.2). Le resume dit seulement que la responsable seule le *regenere* ; qui le *voit* n'est pas dit. Je l'ai reserve a la responsable, par coherence avec le code « donne de vive voix » et avec le risque R3. Alternative : tous les membres le voient.
2. **Une adresse e-mail = un compte** (US-01.5). Cela decoule de la connexion par adresse et mot de passe.
3. **Liste affichee dans l'ordre d'ajout** (US-06.4). Rien n'a ete dit sur l'ordre, et le tri est hors perimetre.
4. **Quantite faite uniquement d'espaces = absente** (US-07.3), et retrait des espaces de bord applique a tous les champs texte. C'est l'extension de la regle donnee pour le prenom.
5. **Adresses e-mail des membres non affichees** (US-10.2). Le resume demande seulement d'afficher le prenom.
6. **Modification d'un article et renommage du foyer hors perimetre.** Le resume liste les actions autorisees sur un article, et la modification n'en fait pas partie.
