# Software Engineering SAT II – UML Diagrams

This document contains the two required architectural diagrams for the Bank Fund Transfer System (Use Case Diagram and Class Diagram) rendered in Mermaid. PlantUML source files are also provided as [`docs/use-case.puml`](file:///docs/use-case.puml) and [`docs/class-diagram.puml`](file:///docs/class-diagram.puml).

---

## 1. Use Case Diagram

```mermaid
flowchart LR
  %% Actors
  Customer((Customer))
  Admin((Administrator))

  %% Subgraph for Bank System Boundary
  subgraph SystemBoundary ["Bank Fund Transfer System"]
    UC_Login["Login & Session Management"]
    UC_Initiate["Initiate Transfer"]
    UC_Validate["Validate Amount & Eligibility"]
    UC_Charge["View Service Charge & Total"]
    UC_Authorise["Authorise Transfer (PIN)"]
    UC_Complete["Complete Transaction (Atomic Commit)"]
    UC_History["View Own History & Details"]
    UC_Reverse["Reverse Eligible Transaction"]
    
    UC_AdminTxns["View All System Transactions"]
    UC_AdminAudit["View Complete Audit History"]
    UC_AdminAction["Perform Permitted Status Action (Reverse)"]
  end

  %% Customer relationships
  Customer --> UC_Login
  Customer --> UC_Initiate
  Customer --> UC_History
  Customer --> UC_Reverse

  UC_Initiate -.->|"<<include>>"| UC_Validate
  UC_Initiate -.->|"<<include>>"| UC_Charge
  UC_Initiate -.->|"<<include>>"| UC_Authorise
  UC_Authorise -.->|"<<include>>"| UC_Complete

  %% Administrator relationships
  Admin --> UC_Login
  Admin --> UC_AdminTxns
  Admin --> UC_AdminAudit
  Admin --> UC_AdminAction
```

---

## 2. Class Diagram

```mermaid
classDiagram
  class User {
    +String id
    +String name
    +String role
    +String status
    +String login_id
    +String pin_hash
    +String created_at
  }

  class Account {
    +String id
    +String owner_user_id
    +String status
    +Integer balance
    +String created_at
  }

  class Transaction {
    +Integer id
    +String reference
    +String idempotency_key
    +String owner_user_id
    +String source_account_id
    +String beneficiary_account_id
    +String beneficiary_name_snapshot
    +Integer amount
    +Integer charge
    +Integer total_debit
    +String charge_rule_snapshot
    +String status
    +String failure_reason
    +String created_at
    +String updated_at
  }

  class TransactionHistory {
    +Integer id
    +String reference_id
    +String actor_id
    +String old_status
    +String new_status
    +String event_at
    +String note
  }

  class ServiceConfig {
    +String key
    +String value
  }

  class AuthenticationService {
    +Map sessions
    +Map clientLockouts
    +login(credentials)
    +logout(sessionId)
    +verifyPinForAuthorise(sessionId, pin)
    +isSessionLocked(clientKey)
  }

  class TransactionService {
    +generateReference()
    +validateAmount(amount)
    +calculateCharge(amount)
    +validateStatusTransition(current, target)
    +initiateTransfer(user, payload)
    +authoriseTransfer(user, ref, pin)
    +completeTransfer(user, ref)
    +reverseTransfer(actor, ref)
    +getTransactionDetails(actor, ref)
    +getAllTransactions(actor)
  }

  %% Relationships and Multiplicities
  User "1" --> "*" Account : owns
  User "1" --> "*" Transaction : initiates
  Account "1" --> "*" Transaction : debited_as_source
  Account "1" --> "*" Transaction : credited_as_beneficiary
  Transaction "1" --> "*" TransactionHistory : logs_lifecycle

  AuthenticationService ..> User : authenticates
  TransactionService ..> Transaction : creates_and_mutates
  TransactionService ..> Account : checks_and_updates_balances
  TransactionService ..> ServiceConfig : reads_charge_rules
  TransactionService ..> TransactionHistory : appends_audit
```
