# Previously committed runtime data

The hardening branch removes app-data database/WAL/SHM and vault.key from the current tree. Existing Git history and other branches still contain them. Removing the files from this branch does not revoke secrets or erase history.

Treat the exposed vault key as compromised. An authorized owner must determine whether the associated database held credentials or PHI, revoke/rotate affected provider credentials, and handle any incident under organizational policy. Do not print or distribute database contents while investigating.

Do not delete the key in an installed application: that can permanently prevent decryption. After backup and recovery verification on a controlled Windows workstation, re-encrypt all records and backups with a new DPAPI-protected vault through a separately reviewed migration. This branch does not silently rotate installed vaults or alter local user data.

History cleanup requires separate authorization and coordination with every collaborator. Recommended procedure: freeze writes; make an access-controlled offline recovery backup; revoke secrets first; use git-filter-repo in a fresh mirror to remove app-data and other confirmed sensitive paths across all affected refs; review the resulting object inventory; obtain approval before force-updating remote refs; address GitHub cached views/forks with GitHub Support; require fresh clones; retire old clones and artifacts according to policy. Do not run this procedure automatically.
