## ROLE: 
Act as a Senior Lead Architect and Full-Stack Developer specialized in Fintech. You have deep expertise in Next.js (App Router), Python Data Engineering, and Quantitative Finance. Your coding style is modular, type-safe, and production-ready.

## PROJECT OBJECTIVE:
I want to build a personal web application to track financial investments for an Italian tax resident. The app focuses on assets traded mainly on Borsa Italiana (Milan) and possibly also major European exchanges. The core value proposition is to automate the tracking of a portfolio starting from a specific Excel (.xlsx) file contain a simple table starting with an header at row 1 and column A. Here are the column in order from A to H:
- A) “Descrizione Titolo” – string value
-  B) “ISIN” – string value
- C) “Quantità” – a floating number
- D) “Divisa” – a string value
- E) “Prezzo Carico (EUR)” – the average purchase prize in EURO
- F) “Data (acquisto/vendita)” – the purchase date (present only if some quantity has been purchased since last import of data)
- G) “Operazione” – a string value that can be only “Acquito” (purchase) or “Vendita” (Sell)
- H) “Prezzo Operazione (EUR)” – a floating number representing the Price of the G operation in EURO.
- I) “Prezzo Corrente (EUR)” – current market price of the asset (used for historical price tracking even without transactions).

The application must register all the- **Ingestione Dati**: Upload di file Excel, parsing intelligente, riconciliazione automatica.
- **Supporto Multi-Utente**:
    - Ogni utente può gestire uno o più portafogli distinti.
    - I dati (Transazioni, Asset, Performance) sono segregati per Portafoglio.
- **Riconciliazione**: Rilevamento automatico di Acquisti/Vendite in base alle differenze di quantità.
- **Logica Fiscale/Finanziaria**: Calcolo MWR (Money Weighted Return) e XIRR.
- **Dashboard**: Visualizzazione chiara di Allocazione e Performance.ial literature.

## TECHNICAL STACK (Vercel and Supabase Non-negotiable):

Hosting: Vercel (Front-end + Backend).

- Frontend: build the user interface using Next.js 14+ with the App Router as the core framework, adopting a modern and well-established UI stack based on Tailwind CSS for styling and Shadcn/UI for components. Where appropriate, integrate widely adopted, production-ready libraries (e.g. Radix UI for accessibility, Lucide Icons for iconography, Framer Motion for smooth micro-animations) to deliver a visually polished, high-performance UI aligned with the standards of today’s leading commercial applications.

- Backend: Python Serverless Functions (hosted on Vercel) for financial math (NumPy/SciPy/Pandas) and data fetching.

- Database: Supabase (PostgreSQL) + Supabase Auth for multi-tenancy.

- Data Providers: OpenFIGI (Identification), Yahoo Finance/OpenBB (Market Data).

### IMPORTANT: take into account the limitation of the free usage of Vercel and Supabase and implement code optimization to cope with these limitations.

## KEY FUNCTIONAL REQUIREMENTS:

- Language: In interactions with the user, always respond in Italian.

- Log-in: for the operations you cannot perform autonomously (e.g., SUPABASE and VERCEL configuration), guide the user step by step. If it can be helpful during the development/testing phase, ask the user to log in to Vercel and Supabase from the IDE terminal.

- Smart Ingestion & Reconciliation: The app parses the portfolio Excel (9 columns). 
  - It detects specific operations ("Acquisto"/"Vendita") or infers them from quantity differences vs DB.
  - **Price-Only Updates**: If an asset has no quantity change (or Qty=0 in input) but includes a "Prezzo Corrente" (Col I), the app saves this price point for historical charting without creating a transaction.
  - **Safe Protocol**: No data is written immediately. The app returns a "Delta" preview for user confirmation.

- Dividend & Expense Ingestion: The app supports a separate file structure (or flexible columns) for cash flows.
  - **Detection**: identified by 3 columns [ISIN, Amount, Date] or specifically by the header "Data Flusso" in the 3rd column.
  - **Expenses**: Negative amounts in the "Amount" column are treated as expenses/cash outflows.
  - **Dividends**: Positive amounts are treated as dividends/coupons.

- ISIN Resolution: It must resolve ISIN codes to Tickers (e.g., IT000... -> TICKER.MI) using a fallback strategy (OpenFIGI -> Heuristic Mapping -> Manual User Override with corresponding Explanatory GUI showed to the user).

- Advanced Math: Performance must be calculated using XIRR (Money Weighted Return) via Python libraries. Currency conversion will not be necessary as the calculation will be made all in EURO.

- Open Source Support: evaluate the use of the OpenBB Platform and other libraries available on GitHub to make the development production-ready and high-performing, eliminating uncertainties and the testing time required for a from-scratch development. 

- Logging: Implement a file-based logging system that can be enabled via a FLAG in the code and that generates a log file with timestamps and all the information needed to trace the application’s logic. You should log only the relevant high-level operations, except for the Excel file ingestion phase, where the log must include detailed information about the processing performed for each ISIN. At the end of the ingestion process, you must list in the log all ISINs stored in the database along with their associated data.

- Unit test for financial math: plan to do a thorought test for the financial math part in order to be sure that the calculations done are correct.

- Caching: Plan for the use of data caching to optimize the speed of operations and the refresh of the graphical interface.

## DEVELOPMENT ROADMAP:
    The development should be carried out in an incremental and structured manner, in order to ensure that the code implementation is correct and consistent. After each step, code reviews and analyses should be performed to optimize logic and performance and to fix any potential issues or errors. Ask the user questions whenever there are unclear areas or important decisions to be made.

Broadly speaking, the following phases can be envisaged; however, you are free to optimize and modify them if you consider it necessary.

- Phase 1: Database Schema & Supabase Setup (SQL & RLS).

- Phase 2: Vercel Environment Configuration (Next.js + Python Serverless setup).

- Phase 3: Data Ingestion Engine (Parsing the specific Excel logic).

- Phase 4: Financial Logic (ISIN Resolver & MWR Calculation in Python).

Phase 5: Frontend Dashboard & Visualization.

### YOUR INSTRUCTION: DO NOT WRITE CODE YET.

1. Analyze the requirements and the stack above.

2. Review the logic: Is using Vercel Serverless for Python (to run Scipy/Pandas) a viable strategy for this scale, or do you foresee    timeout/memory limits?

3. Confirm you understand of Excel Ingestion logic.

##  If everything is clear, reply with "BLUEPRINT ACCEPTED" and list any critical architectural questions you have before we start Phase 1.