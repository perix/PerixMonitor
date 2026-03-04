import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ReportData } from "@/hooks/useReport";

export interface ReportCosts {
    advisory: number;
    wealthTaxRate: number; // e.g. 0.0020 for 0.20%
    stampDuty: boolean; // 34.20
}

export const generatePdfReport = (
    reportData: ReportData,
    costs: ReportCosts,
    llmText?: string | null,
    portfolioName?: string
) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // Helper functions
    const formatCurrency = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val || 0);
    const formatPct = (val: number) => new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 2 }).format((val || 0) / 100);
    const formatDate = (d: string) => { const parts = d.split('-'); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d; };

    // Titolo
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text(`Report Performance: ${portfolioName || 'Portafoglio'}`, margin, 20);

    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Periodo: ${formatDate(reportData.start_date)} - ${formatDate(reportData.end_date)}`, margin, 27);

    let currentY = 35;

    // ==========================================
    // CAPITOLO 2: Performance Complessiva (Portato all'inizio)
    // ==========================================
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text("1. Sintesi Performance", margin, currentY);
    currentY += 8;

    const summaryData = [
        ["Valore Inizio Periodo", formatCurrency(reportData.summary.start_value)],
        ["Valore Fine Periodo", formatCurrency(reportData.summary.end_value)],
        ["Flussi di Cassa Netti", formatCurrency(reportData.summary.net_inflows)],
        ["Dividendi / Cedole Lorde Riscossi", formatCurrency(reportData.summary.total_dividends)],
        ["Profit & Loss Periodo", formatCurrency(reportData.summary.period_pl || 0)],
        ["Rendimento Lordo (MWR Base)", formatPct(reportData.summary.mwr_percent)],
    ];

    autoTable(doc, {
        startY: currentY,
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [63, 81, 181] },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // Migliori e Peggiori
    if (reportData.best_performers?.length > 0) {
        doc.setFontSize(12);
        doc.text("Migliori Performance nel periodio:", margin, currentY);
        currentY += 6;

        const bestData = reportData.best_performers.map(b => [b.name, b.isin, formatCurrency(b.pl), formatPct(b.pl_pct)]);
        autoTable(doc, {
            startY: currentY,
            head: [['Asset', 'ISIN', 'P&L Assoluto', 'MWR (%)']],
            body: bestData,
            theme: 'striped',
            headStyles: { fillColor: [76, 175, 80] },
            styles: { fontSize: 9 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    if (reportData.worst_performers?.length > 0) {
        doc.setFontSize(12);
        doc.text("Peggiori Performance nel periodio:", margin, currentY);
        currentY += 6;

        const worstData = reportData.worst_performers.map(w => [w.name, w.isin, formatCurrency(w.pl), formatPct(w.pl_pct)]);
        autoTable(doc, {
            startY: currentY,
            head: [['Asset', 'ISIN', 'P&L Assoluto', 'MWR (%)']],
            body: worstData,
            theme: 'striped',
            headStyles: { fillColor: [244, 67, 54] },
            styles: { fontSize: 9 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    // ==========================================
    // CAPITOLO 2: Analisi LLM (Opzionale) - subito dopo la sintesi
    // ==========================================
    // ==========================================
    // CAPITOLO 2: Analisi LLM (Opzionale) - subito dopo la sintesi
    // ==========================================
    if (llmText && llmText.trim().length > 0) {
        // [FIX] Pulizia caratteri malformati (es. â€™ -> ') per evitare problemi di rendering PDF
        let cleanLlmText = llmText;
        try {
            // Se il testo è una stringa codificata male da un buffer, proviamo a normalizzarla
            cleanLlmText = decodeURIComponent(escape(llmText));
        } catch (e) {
            // Se fallisce, usiamo rimpiazzi comuni manuali per le sequenze UTF-8 rotte più frequenti
            cleanLlmText = llmText
                .replace(/â€™/g, "'")
                .replace(/â€"/g, "—")
                .replace(/â€œ/g, '"')
                .replace(/â€\x9d/g, '"')
                .replace(/â€¦/g, "...");
        }

        console.log(`[PDF_GEN] Trovato testo LLM (${cleanLlmText.length} caratteri). rendering Capitolo 2.`);

        if (currentY > doc.internal.pageSize.height - 80) { doc.addPage(); currentY = 20; }

        doc.setFontSize(16);
        doc.setTextColor(40, 40, 40);
        doc.text("2. Valutazione Complessiva del Portafoglio", margin, currentY);
        currentY += 8;

        // Usiamo autoTable per il blocco di testo: gestisce meglio i salti di pagina automatici
        autoTable(doc, {
            startY: currentY,
            body: [[cleanLlmText]],
            theme: 'plain',
            styles: {
                fontSize: 10,
                cellPadding: 0,
                textColor: [30, 30, 30],
                fontStyle: 'normal',
                overflow: 'linebreak'
            },
            columnStyles: { 0: { cellWidth: pageWidth - margin * 2 } },
            margin: { left: margin, right: margin }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
    } else {
        console.warn("[PDF_GEN] llmText assente o vuoto. Capitolo 2 saltato.");
    }

    // Numerazione dinamica dei capitoli successivi in base a se c'è LLM
    const hasLlm = llmText && llmText.trim().length > 0;
    const chOffset = hasLlm ? 3 : 2;

    // ==========================================
    // CAPITOLO: Transazioni
    // ==========================================
    if (currentY > doc.internal.pageSize.height - 40) { doc.addPage(); currentY = 20; }

    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text(`${chOffset}. Movimenti del Periodo (Acquisti / Vendite)`, margin, currentY);
    currentY += 8;

    if (reportData.transactions.length > 0) {
        const transRows = reportData.transactions.map(t => [
            formatDate(t.date),
            t.type === 'BUY' ? 'Acquisto' : 'Vendita',
            t.name,
            t.isin,
            t.quantity.toString(),
            formatCurrency(t.price),
            formatCurrency(t.value)
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [['Data', 'Tipo', 'Nome Asset', 'ISIN', 'Quantità', 'Prezzo', 'Controvalore']],
            body: transRows,
            theme: 'grid',
            headStyles: { fillColor: [50, 50, 50] },
            styles: { fontSize: 8 },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 1) {
                    if (data.cell.raw === 'Acquisto') data.cell.styles.textColor = [76, 175, 80];
                    if (data.cell.raw === 'Vendita') data.cell.styles.textColor = [244, 67, 54];
                }
            }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
    } else {
        doc.setFontSize(10);
        doc.text("Nessuna transazione nel periodo.", margin, currentY);
        currentY += 15;
    }

    // ==========================================
    // CAPITOLO: Plusvalenze e Tassazione
    // ==========================================
    if (currentY > doc.internal.pageSize.height - 50) { doc.addPage(); currentY = 20; }

    doc.setFontSize(16);
    doc.text(`${chOffset + 1}. Plusvalenze Realizzate e Tassazione (Regime Amministrato)`, margin, currentY);
    currentY += 8;

    const cgData = [
        ["Plusvalenze totali realizzate (vendite)", formatCurrency(reportData.summary.realized_capital_gains)],
        ["Imposta sulle plusvalenze (26%)", formatCurrency(-reportData.summary.estimated_cg_tax)]
    ];

    autoTable(doc, {
        startY: currentY,
        body: cgData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 3, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' } }
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;

    if (reportData.capital_gains_detail && reportData.capital_gains_detail.length > 0) {
        const cgRows = reportData.capital_gains_detail.map(cg => [
            formatDate(cg.date),
            cg.name,
            cg.isin,
            formatCurrency(cg.pmc),
            formatCurrency(cg.sell_price),
            formatCurrency(cg.realized_gain)
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [['Data', 'Asset', 'ISIN', 'PMC (Stimato)', 'Prezzo Vendita', 'Plusvalenza Lorda']],
            body: cgRows,
            theme: 'striped',
            styles: { fontSize: 8 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    // ==========================================
    // CAPITOLO: Costi e Gestione
    // ==========================================
    if (currentY > doc.internal.pageSize.height - 60) { doc.addPage(); currentY = 20; }

    doc.setFontSize(16);
    doc.text(`${chOffset + 2}. Analisi Costi e Performance Netta`, margin, currentY);
    currentY += 8;

    // Calcolo giorni nel periodo per rapportare i costi annui al periodo (adesso fatto dal backend, noi stampiamo solo l'output)

    const costsData = [
        ["Costo Consulenza Finanziaria (rateo periodo impostato)", formatCurrency(reportData.summary.estimated_advisory_cost || 0)],
        ["Imposta Patrimoniale proporzionale (calcolata su Valore di Fine Periodo)", formatCurrency(reportData.summary.estimated_wealth_tax || 0)],
        ["Imposta di bollo Conto Corrente (rateo)", formatCurrency(reportData.summary.estimated_stamp_duty || 0)],
        ["Imposta stimata sulle plusvalenze realizzate", formatCurrency(reportData.summary.estimated_cg_tax || 0)],
        ["", ""],
        ["TOTALE COSTI (espliciti)DEL PERIODO", formatCurrency(reportData.summary.total_costs || 0)],
        ["MWR (al netto dei costi espliciti)", formatPct(reportData.summary.adjusted_mwr_percent || 0)]
    ];

    autoTable(doc, {
        startY: currentY,
        body: costsData,
        theme: 'grid',
        styles: { fontSize: 9 },
        didParseCell: function (data) {
            if (data.row.index >= 5) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [240, 240, 240];
            }
        }
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Salva file
    const safeDate = new Date().toISOString().split('T')[0];
    doc.save(`Report_Portafoglio_${safeDate}.pdf`);
}
