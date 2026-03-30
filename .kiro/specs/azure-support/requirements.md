# Documento dei Requisiti — Supporto Azure

## Introduzione

Questa specifica definisce i requisiti per l'integrazione di Microsoft Azure in Pabawi. L'obiettivo è aggiungere un plugin Azure che implementi l'interfaccia `InformationSourcePlugin` (e opzionalmente `ExecutionToolPlugin`) per consentire la gestione delle macchine virtuali Azure direttamente dall'interfaccia unificata di Pabawi, seguendo gli stessi pattern architetturali già utilizzati per AWS e Proxmox.

## Glossario

- **Azure_Plugin**: Plugin di integrazione Azure per Pabawi, che estende `BasePlugin` e implementa le interfacce `InformationSourcePlugin` e `ExecutionToolPlugin`
- **Azure_Service**: Servizio interno che incapsula le chiamate alle API Azure SDK (`@azure/arm-compute`, `@azure/identity`)
- **ConfigService**: Servizio di configurazione esistente di Pabawi che carica e valida le variabili d'ambiente
- **IntegrationManager**: Gestore centrale dei plugin che registra, inizializza e orchestra tutte le integrazioni
- **VM**: Macchina virtuale Azure (Azure Virtual Machine)
- **Service_Principal**: Identità applicativa Azure utilizzata per l'autenticazione tramite `clientId`, `clientSecret` e `tenantId`
- **Subscription**: Sottoscrizione Azure che raggruppa le risorse e la fatturazione
- **Resource_Group**: Contenitore logico Azure che raggruppa risorse correlate
- **Node**: Rappresentazione interna di Pabawi di un host gestito, definita in `integrations/bolt/types.ts`
- **NodeGroup**: Raggruppamento logico di nodi in Pabawi, definito in `integrations/types.ts`
- **HealthStatus**: Interfaccia standard di Pabawi per lo stato di salute di un plugin

## Requisiti

### Requisito 1: Configurazione del plugin Azure tramite variabili d'ambiente

**User Story:** Come amministratore di Pabawi, voglio configurare l'integrazione Azure tramite variabili d'ambiente, in modo da poter abilitare e personalizzare il collegamento ad Azure senza modificare il codice.

#### Criteri di Accettazione

1. WHEN la variabile `AZURE_ENABLED` è impostata a `true`, THE ConfigService SHALL analizzare e validare le variabili d'ambiente Azure (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SUBSCRIPTION_ID`)
2. WHEN la variabile `AZURE_ENABLED` è impostata a `true` e `AZURE_TENANT_ID` non è definita, THE ConfigService SHALL generare un errore con il messaggio "AZURE_TENANT_ID is required when AZURE_ENABLED is true"
3. WHEN la variabile `AZURE_ENABLED` è impostata a `true` e `AZURE_SUBSCRIPTION_ID` non è definita, THE ConfigService SHALL generare un errore con il messaggio "AZURE_SUBSCRIPTION_ID is required when AZURE_ENABLED is true"
4. THE ConfigService SHALL supportare la variabile opzionale `AZURE_RESOURCE_GROUP` per filtrare le risorse a un singolo Resource Group
5. THE ConfigService SHALL supportare la variabile opzionale `AZURE_REGION` per filtrare le VM a una specifica regione Azure
6. THE ConfigService SHALL supportare la variabile opzionale `AZURE_PRIORITY` per definire la priorità del plugin nell'aggregazione dell'inventario
7. IF la variabile `AZURE_ENABLED` non è definita o è impostata a `false`, THEN THE ConfigService SHALL escludere la configurazione Azure dall'oggetto integrazioni

### Requisito 2: Registrazione e inizializzazione del plugin Azure

**User Story:** Come amministratore di Pabawi, voglio che il plugin Azure si registri automaticamente nell'IntegrationManager all'avvio, in modo che sia disponibile insieme alle altre integrazioni.

#### Criteri di Accettazione

1. WHEN il ConfigService restituisce una configurazione Azure con `enabled: true`, THE Azure_Plugin SHALL registrarsi nell'IntegrationManager come plugin di tipo `both`
2. WHEN il Azure_Plugin viene inizializzato, THE Azure_Plugin SHALL autenticarsi verso Azure utilizzando le credenziali Service Principal configurate (`tenantId`, `clientId`, `clientSecret`)
3. WHEN l'autenticazione Azure ha successo, THE Azure_Plugin SHALL impostare il proprio stato interno a `initialized: true`
4. IF l'autenticazione Azure fallisce durante l'inizializzazione, THEN THE Azure_Plugin SHALL registrare l'errore nel log e impostare il proprio stato a `initialized: false` senza interrompere l'avvio di Pabawi
5. WHILE il Azure_Plugin è nello stato `initialized: false`, THE Azure_Plugin SHALL restituire array vuoti per le chiamate a `getInventory()` e `getGroups()`

### Requisito 3: Inventario delle macchine virtuali Azure

**User Story:** Come operatore, voglio visualizzare le macchine virtuali Azure nell'inventario unificato di Pabawi, in modo da avere una visione completa dell'infrastruttura.

#### Criteri di Accettazione

1. WHEN viene invocato `getInventory()`, THE Azure_Plugin SHALL restituire un array di oggetti `Node` corrispondenti alle VM Azure presenti nella Subscription configurata
2. THE Azure_Plugin SHALL mappare ogni VM Azure a un oggetto `Node` con i seguenti campi: `name` (nome della VM), `uri` (indirizzo IP privato o pubblico della VM), `source` impostato a `"azure"`
3. WHERE la variabile `AZURE_RESOURCE_GROUP` è configurata, THE Azure_Plugin SHALL filtrare l'inventario restituendo solo le VM appartenenti al Resource Group specificato
4. WHERE la variabile `AZURE_REGION` è configurata, THE Azure_Plugin SHALL filtrare l'inventario restituendo solo le VM nella regione specificata
5. WHEN una VM Azure non ha un indirizzo IP assegnato, THE Azure_Plugin SHALL impostare il campo `uri` del Node al nome della VM
6. IF l'API Azure restituisce un errore durante il recupero dell'inventario, THEN THE Azure_Plugin SHALL registrare l'errore nel log e restituire un array vuoto

### Requisito 4: Raggruppamento delle macchine virtuali Azure

**User Story:** Come operatore, voglio che le VM Azure siano organizzate in gruppi logici nell'inventario di Pabawi, in modo da poter filtrare e gestire le risorse per Resource Group, regione o tag.

#### Criteri di Accettazione

1. WHEN viene invocato `getGroups()`, THE Azure_Plugin SHALL restituire un array di oggetti `NodeGroup` che raggruppano le VM per Resource Group
2. THE Azure_Plugin SHALL creare un NodeGroup aggiuntivo per ogni regione Azure contenente VM, con formato id `azure:region:<nome_regione>`
3. THE Azure_Plugin SHALL creare un NodeGroup per ogni tag Azure presente sulle VM, con formato id `azure:tag:<chiave_tag>:<valore_tag>`
4. THE Azure_Plugin SHALL impostare il campo `source` di ogni NodeGroup a `"azure"`
5. IF l'API Azure restituisce un errore durante il recupero dei gruppi, THEN THE Azure_Plugin SHALL registrare l'errore nel log e restituire un array vuoto

### Requisito 5: Dettagli e facts delle macchine virtuali Azure

**User Story:** Come operatore, voglio consultare i dettagli di una specifica VM Azure, in modo da conoscerne la configurazione e lo stato corrente.

#### Criteri di Accettazione

1. WHEN viene invocato `getNodeFacts(nodeId)` con un nodeId valido, THE Azure_Plugin SHALL restituire un oggetto `Facts` contenente le proprietà della VM Azure: `vmSize`, `location`, `provisioningState`, `powerState`, `osType`, `osDiskSizeGB`, `privateIpAddress`, `publicIpAddress`, `resourceGroup`, `subscriptionId`, `tags`
2. WHEN viene invocato `getNodeFacts(nodeId)` con un nodeId che non corrisponde a nessuna VM Azure, THE Azure_Plugin SHALL restituire un oggetto `Facts` vuoto
3. IF l'API Azure restituisce un errore durante il recupero dei facts, THEN THE Azure_Plugin SHALL registrare l'errore nel log e restituire un oggetto `Facts` vuoto
4. WHEN viene invocato `getNodeData(nodeId, "status")`, THE Azure_Plugin SHALL restituire lo stato di esecuzione della VM (running, stopped, deallocated)
5. WHEN viene invocato `getNodeData(nodeId, "network")`, THE Azure_Plugin SHALL restituire le informazioni di rete della VM (interfacce di rete, IP privati, IP pubblici, security groups associati)

### Requisito 6: Health check del plugin Azure

**User Story:** Come amministratore di Pabawi, voglio monitorare lo stato di connessione del plugin Azure, in modo da identificare rapidamente problemi di autenticazione o connettività.

#### Criteri di Accettazione

1. WHEN viene invocato `healthCheck()`, THE Azure_Plugin SHALL verificare la connettività verso le API Azure tentando di elencare le sottoscrizioni accessibili
2. WHEN la verifica di connettività ha successo, THE Azure_Plugin SHALL restituire un oggetto `HealthStatus` con `healthy: true` e un messaggio che include il nome della Subscription
3. IF le credenziali Azure sono scadute o non valide, THEN THE Azure_Plugin SHALL restituire un oggetto `HealthStatus` con `healthy: false` e un messaggio descrittivo dell'errore di autenticazione
4. IF le API Azure non sono raggiungibili, THEN THE Azure_Plugin SHALL restituire un oggetto `HealthStatus` con `healthy: false` e un messaggio che indica il problema di connettività
5. WHEN il plugin ha accesso parziale alle risorse (permessi IAM insufficienti per alcune operazioni), THE Azure_Plugin SHALL restituire un oggetto `HealthStatus` con `degraded: true`, elencando le capability funzionanti in `workingCapabilities` e quelle non funzionanti in `failingCapabilities`

### Requisito 7: Degradazione graduale del plugin Azure

**User Story:** Come operatore, voglio che Pabawi continui a funzionare correttamente anche quando l'integrazione Azure non è disponibile, in modo da non perdere l'accesso alle altre integrazioni.

#### Criteri di Accettazione

1. IF il plugin Azure non riesce a inizializzarsi, THEN THE IntegrationManager SHALL continuare l'inizializzazione degli altri plugin senza interruzioni
2. WHILE il plugin Azure è nello stato `healthy: false`, THE Azure_Plugin SHALL restituire dati vuoti per tutte le query di inventario senza generare eccezioni non gestite
3. WHEN il plugin Azure passa dallo stato `healthy: true` a `healthy: false`, THE Azure_Plugin SHALL registrare un messaggio di warning nel log con i dettagli dell'errore
4. WHEN il plugin Azure passa dallo stato `healthy: false` a `healthy: true`, THE Azure_Plugin SHALL registrare un messaggio informativo nel log indicando il ripristino della connessione

### Requisito 8: Gestione del ciclo di vita delle VM Azure

**User Story:** Come operatore, voglio poter avviare, arrestare e deallocare le VM Azure direttamente da Pabawi, in modo da gestire le risorse cloud dall'interfaccia unificata.

#### Criteri di Accettazione

1. WHEN viene invocato `executeAction()` con tipo `command` e azione `start`, THE Azure_Plugin SHALL avviare la VM Azure specificata nel target
2. WHEN viene invocato `executeAction()` con tipo `command` e azione `stop`, THE Azure_Plugin SHALL arrestare la VM Azure specificata nel target
3. WHEN viene invocato `executeAction()` con tipo `command` e azione `deallocate`, THE Azure_Plugin SHALL deallocare la VM Azure specificata nel target
4. WHEN viene invocato `executeAction()` con tipo `command` e azione `restart`, THE Azure_Plugin SHALL riavviare la VM Azure specificata nel target
5. WHEN un'operazione di ciclo di vita viene completata con successo, THE Azure_Plugin SHALL restituire un oggetto `ExecutionResult` con `success: true` e i dettagli dell'operazione
6. IF un'operazione di ciclo di vita fallisce, THEN THE Azure_Plugin SHALL restituire un oggetto `ExecutionResult` con `success: false` e il messaggio di errore dell'API Azure
7. THE Azure_Plugin SHALL esporre le operazioni di ciclo di vita tramite `listCapabilities()` con i parametri richiesti per ogni azione

### Requisito 9: Integrazione nell'inventario aggregato

**User Story:** Come operatore, voglio che le VM Azure appaiano nell'inventario aggregato di Pabawi insieme ai nodi delle altre integrazioni, in modo da avere una visione unificata dell'infrastruttura.

#### Criteri di Accettazione

1. THE IntegrationManager SHALL includere i nodi restituiti dal Azure_Plugin nell'inventario aggregato quando il plugin è abilitato e inizializzato
2. WHEN una VM Azure ha lo stesso hostname di un nodo proveniente da un'altra integrazione (Bolt, PuppetDB, Ansible, SSH, AWS, Proxmox), THE IntegrationManager SHALL collegare i nodi tramite il NodeLinkingService
3. THE Azure_Plugin SHALL impostare il campo `source` a `"azure"` per tutti i nodi e gruppi restituiti, consentendo al NodeLinkingService di identificare la provenienza dei dati
4. THE Azure_Plugin SHALL rispettare la configurazione `priority` per determinare l'ordine di precedenza nell'aggregazione dell'inventario

### Requisito 10: Test unitari del plugin Azure

**User Story:** Come sviluppatore, voglio che il plugin Azure sia coperto da test unitari, in modo da garantire la correttezza dell'implementazione e prevenire regressioni.

#### Criteri di Accettazione

1. THE Azure_Plugin SHALL avere test unitari che verifichino l'inizializzazione corretta con credenziali valide
2. THE Azure_Plugin SHALL avere test unitari che verifichino il comportamento con credenziali mancanti o non valide
3. THE Azure_Plugin SHALL avere test unitari che verifichino la mappatura corretta delle VM Azure in oggetti `Node`
4. THE Azure_Plugin SHALL avere test unitari che verifichino la creazione corretta dei `NodeGroup` per Resource Group, regione e tag
5. THE Azure_Plugin SHALL avere test unitari che verifichino il comportamento di degradazione graduale in caso di errori API
6. THE Azure_Plugin SHALL avere test unitari che verifichino le operazioni di ciclo di vita delle VM (start, stop, deallocate, restart)
7. FOR ALL le VM Azure restituite da `getInventory()`, la mappatura a `Node` e la successiva lettura tramite `getNodeFacts()` SHALL restituire dati coerenti con la VM originale (proprietà round-trip)
