# Comprehensive Development Skills Reference (Skill.md)

This reference document catalogs the specialized AI agent skills available for software development, architecture, code quality, multi-agent orchestration, and continuous learning.

You can invoke any skill directly in your prompt using the `$skill-name` syntax (e.g., `Use $agent-coder and $tdd-workflow to implement the feature`).

---

## Quick Reference Master Table

| Category | Skill Name | Invoke Syntax | Core Purpose |
| :--- | :--- | :--- | :--- |
| **Swarm & Agents** | Swarm Orchestration | `$swarm-orchestration` | Multi-agent coordination for complex multi-file tasks |
| **Swarm & Agents** | Agent Coder | `$agent-coder` | Dedicated implementation worker for writing clean, tested code |
| **Swarm & Agents** | Agent Tester | `$agent-tester` | Automated test suite creation (Unit, Integration, E2E) |
| **Swarm & Agents** | Agent Reviewer | `$agent-reviewer` | Deep architectural, security, and maintainability code reviews |
| **Swarm & Agents** | Agent Architect | `$agent-architect` | High-level system design, data modeling, and boundary definition |
| **Methodologies** | SPARC Methodology | `$sparc-methodology` | 5-phase structured development (`Specification` → `Completion`) |
| **Methodologies** | TDD Workflow | `$tdd-workflow` | Enforces Red → Green → Refactor test-driven cycle |
| **Methodologies** | Get Shit Done (GSD) | `$gsd-next` | Milestone-driven autonomous planning and execution phases |
| **Fullstack / UI** | Senior Fullstack | `$senior-fullstack` | Comprehensive fullstack patterns (React, Next.js, APIs, DBs) |
| **Fullstack / UI** | React Best Practices | `$react-best-practices` | Component optimization, clean hooks, state management |
| **Fullstack / UI** | UI Skills | `$ui-skills` | Premium visual aesthetics, typography, animations, responsiveness |
| **Fullstack / UI** | API Design Principles | `$api-design-principles` | REST/GraphQL API contracts, validation, error handling |
| **Quality & Security**| Code Reviewer | `$code-reviewer` | Comprehensive peer code review against best practices |
| **Quality & Security**| Security Audit | `$security-audit` | OWASP Top 10 vulnerability scanning and remediation |
| **Quality & Security**| Debugging Toolkit | `$debugging-toolkit` | Systematic root-cause tracing and error resolution |
| **Memory & Learning** | Memory Management | `$memory-management` | Store and retrieve reusable engineering patterns via vector DB |
| **Memory & Learning** | Neural Training | `$neural-training` | Self-learning optimization from historical task trajectories |

---

## 1. Swarm & Multi-Agent Orchestration Skills

### `$swarm-orchestration`
- **When to use:** Multi-file refactorings, major feature implementations, or tasks requiring parallel execution.
- **Description:** Coordinates a hierarchical or mesh team of specialized subagents (`coordinator`, `coder`, `tester`, `reviewer`).
- **Example Usage:**
  ```text
  Use $swarm-orchestration to design and implement the new billing system across backend API routes and frontend dashboard.
  ```

### `$agent-coder`
- **When to use:** Direct code generation, feature implementation, or bug fixes.
- **Description:** Focuses strictly on writing production-grade, idiomatic code adhering to existing project standards.
- **Example Usage:**
  ```text
  Use $agent-coder to build the JWT token rotation utility in src/auth/jwt.ts.
  ```

### `$agent-tester`
- **When to use:** Creating unit tests, integration tests, E2E tests, or filling test coverage gaps.
- **Description:** Analyzes implementation contracts and generates thorough tests covering happy paths, edge cases, and failure modes.
- **Example Usage:**
  ```text
  Use $agent-tester to write comprehensive Vitest unit tests for the invoice calculation service.
  ```

### `$agent-reviewer`
- **When to use:** Pre-merge inspections, pull request reviews, and auditing complex logic.
- **Description:** Evaluates code against performance, security, architecture, and maintainability standards.
- **Example Usage:**
  ```text
  Use $agent-reviewer to review the changes in src/services/user-service.ts before committing.
  ```

---

## 2. Structured Development Methodologies

### `$sparc-methodology`
- **When to use:** Starting a new feature, module, or service from scratch.
- **Description:** Enforces the 5-phase SPARC lifecycle:
  1. **Specification:** Define exact requirements and constraints.
  2. **Pseudocode:** Outline algorithms and data flow.
  3. **Architecture:** Design interfaces, types, and module boundaries.
  4. **Refinement:** Iterate and optimize design.
  5. **Completion:** Execute implementation and verification.
- **Example Usage:**
  ```text
  Follow $sparc-methodology to design and implement the multi-tenant organization switching feature.
  ```

### `$tdd-workflow`
- **When to use:** Implementing business logic, utilities, calculations, or critical backend services.
- **Description:** Strictly enforces the **RED-GREEN-REFACTOR** cycle:
  1. **Red:** Write a failing test defining expected behavior.
  2. **Green:** Write the minimal implementation required to make the test pass.
  3. **Refactor:** Clean up code while keeping tests green.
- **Example Usage:**
  ```text
  Use $tdd-workflow to build the tax calculation pipeline.
  ```

### `$gsd-next`
- **When to use:** Managing multi-step projects with milestone tracking and autonomous execution guarantees.
- **Description:** Advances the current workspace through structured planning (`PLAN.md`), execution waves, and verification checkpoints.
- **Example Usage:**
  ```text
  Run $gsd-next to inspect the current project plan and advance the next implementation phase.
  ```

---

## 3. Fullstack & Frontend Engineering Skills

### `$senior-fullstack`
- **When to use:** End-to-end web app development spanning database models, server actions/APIs, and frontend UI.
- **Description:** Applies enterprise-grade fullstack patterns, proper data mutation handling, caching, and clean separation of concerns.

### `$react-best-practices`
- **When to use:** Creating or refactoring React / Next.js components.
- **Description:** Enforces modern functional React patterns, memoization rules, hook modularity, and accessibility (a11y).

### `$ui-skills`
- **When to use:** Designing user interfaces, dashboards, modals, or user-facing workflows.
- **Description:** Enforces high-aesthetic design tokens, proper visual hierarchy, curated color palettes, micro-interactions, and responsive layouts.

### `$api-design-principles`
- **When to use:** Creating REST endpoints, GraphQL resolvers, or API SDKs.
- **Description:** Ensures structured request/response schemas (Zod validation), standard HTTP status codes, pagination, and clear error contracts.

---

## 4. Code Quality, Security & Debugging

### `$security-audit`
- **When to use:** Reviewing authentication flows, data inputs, API endpoints, or database queries.
- **Description:** Scans for OWASP Top 10 vulnerabilities (SQL injection, XSS, CSRF, broken access control, insecure direct object references).

### `$debugging-toolkit`
- **When to use:** Diagnosing intermittent bugs, stack traces, unhandled rejections, or unexpected state mutations.
- **Description:** Uses systematic hypothesis-driven debugging, tracing variables, isolating state transitions, and verifying root causes.

---

## 5. Memory & Continuous Learning

### `$memory-management`
- **When to use:** Before starting a task to learn from past solutions, or after completing a task to store successful patterns.
- **Description:** Interfaces with vector database storage (`AgentDB` / Ruflo memory) to retrieve similar past patterns or save proven engineering solutions.
- **CLI Commands:**
  ```powershell
  # Search memory before starting work
  claude-flow memory search --query "authentication middleware pattern"

  # Store a pattern after success
  claude-flow memory store --key "pattern-auth-jwt" --value "Detailed solution notes"
  ```

---

## 6. Standard Development Workflow Recipes

### Recipe A: New Feature Implementation
1. **Search Memory:** Check if a similar feature was built before (`$memory-management`).
2. **Design Plan:** Define specification and architecture (`$sparc-methodology`).
3. **Write Tests First:** Create failing specs (`$tdd-workflow`, `$agent-tester`).
4. **Implement Logic:** Write production code (`$agent-coder`, `$react-best-practices`).
5. **Peer Review:** Conduct architectural and security review (`$code-reviewer`, `$security-audit`).
6. **Store Pattern:** Save successful implementation insights (`$memory-management`).

### Recipe B: Complex Bug Fix
1. **Trace & Diagnose:** Use `$debugging-toolkit` to isolate root cause.
2. **Write Reproduction Test:** Add a failing regression test (`$tdd-workflow`).
3. **Fix & Verify:** Implement the fix (`$agent-coder`) and verify all tests pass.
4. **Review:** Audit fix for edge cases (`$agent-reviewer`).