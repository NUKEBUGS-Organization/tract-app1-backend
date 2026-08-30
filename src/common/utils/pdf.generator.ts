import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface ContractPdfData {
  sellerName: string;
  sellerAddress: string;
  buyerName: string;
  buyerAddress: string;
  propertyAddress: string;
  propertyBlock?: string;
  propertyLot?: string;
  purchasePrice: number;
  emdAmount: number;
  balanceAmount: number;
  closingDays: number;
  effectiveDate: Date;
}

export const fmtMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Matches the phrasing used in the "made this ___ day of ___, 20__" header
// line — shared with the DocuSeal submission values so both documents read
// identically.
export const fmtEffectiveDate = (date: Date) => {
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const yearShort = String(date.getFullYear()).slice(-2);
  return `${ordinal(day)} day of ${month}, ${yearShort}`;
};

export async function generateContractPdf(data: ContractPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const black = rgb(0, 0, 0);
  const lineGray = rgb(0.5, 0.5, 0.5);

  const newPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  const drawCenteredText = (text: string, size: number, f = font, color = black) => {
    const width = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (pageWidth - width) / 2, y, size, font: f, color });
    y -= size + 6;
  };

  const wrapText = (text: string, size: number, f = font): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > contentWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const drawParagraph = (text: string, size = 10, f = font, lineHeight = 14, spacingAfter = 8) => {
    const lines = wrapText(text, size, f);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: margin, y, size, font: f, color: black });
      y -= lineHeight;
    }
    y -= spacingAfter;
  };

  const drawLabeledParagraph = (label: string, body: string, size = 10, lineHeight = 14, spacingAfter = 8) => {
    const fullPlainWidth = fontBold.widthOfTextAtSize(label, size);
    const words = body.split(' ');
    let lines: { text: string; bold: boolean }[][] = [];
    let current: { text: string; bold: boolean }[] = [{ text: label, bold: true }];
    let currentWidth = fullPlainWidth;

    for (const word of words) {
      const wWidth = font.widthOfTextAtSize(` ${word}`, size);
      if (currentWidth + wWidth > contentWidth) {
        lines.push(current);
        current = [{ text: word, bold: false }];
        currentWidth = font.widthOfTextAtSize(word, size);
      } else {
        current.push({ text: ` ${word}`, bold: false });
        currentWidth += wWidth;
      }
    }
    lines.push(current);

    for (const lineSegs of lines) {
      ensureSpace(lineHeight);
      let x = margin;
      for (const seg of lineSegs) {
        const f = seg.bold ? fontBold : font;
        page.drawText(seg.text, { x, y, size, font: f, color: black });
        x += f.widthOfTextAtSize(seg.text, size);
      }
      y -= lineHeight;
    }
    y -= spacingAfter;
  };

  const drawHeading = (text: string, size = 11) => {
    ensureSpace(size + 10);
    page.drawText(text, { x: margin, y, size, font: fontBold, color: black });
    y -= size + 8;
  };

  const drawLine = (label: string, value: string, size = 10, lineHeight = 16) => {
    ensureSpace(lineHeight + 4);
    const labelWidth = fontBold.widthOfTextAtSize(label, size);
    page.drawText(label, { x: margin, y, size, font: fontBold, color: black });

    const valueX = margin + labelWidth + 4;
    const lineEndX = pageWidth - margin;

    page.drawText(value, { x: valueX, y, size, font, color: black });

    const valueWidth = font.widthOfTextAtSize(value, size);
    page.drawLine({
      start: { x: valueX + valueWidth + 4, y: y - 2 },
      end: { x: lineEndX, y: y - 2 },
      thickness: 0.75,
      color: lineGray,
    });

    y -= lineHeight + 6;
  };

  const drawSignatureLine = (
    label: string,
    value: string,
    dateLabel: string,
    dateValue: string,
    size = 10,
    lineHeight = 18,
  ) => {
    ensureSpace(lineHeight + 6);
    const labelWidth = fontBold.widthOfTextAtSize(label, size);
    page.drawText(label, { x: margin, y, size, font: fontBold, color: black });

    const sigLineStart = margin + labelWidth + 4;
    const sigLineEnd = sigLineStart + 220;

    page.drawLine({
      start: { x: sigLineStart, y: y - 2 },
      end: { x: sigLineEnd, y: y - 2 },
      thickness: 0.75,
      color: lineGray,
    });

    if (value) {
      page.drawText(value, { x: sigLineStart + 4, y, size, font, color: black });
    }

    const dateLabelX = sigLineEnd + 20;
    const dateLabelWidth = fontBold.widthOfTextAtSize(dateLabel, size);
    page.drawText(dateLabel, { x: dateLabelX, y, size, font: fontBold, color: black });

    const dateLineStart = dateLabelX + dateLabelWidth + 4;
    page.drawLine({
      start: { x: dateLineStart, y: y - 2 },
      end: { x: pageWidth - margin, y: y - 2 },
      thickness: 0.75,
      color: lineGray,
    });

    if (dateValue) {
      page.drawText(dateValue, { x: dateLineStart + 4, y, size, font, color: black });
    }

    y -= lineHeight + 12;
  };

  const spacer = (amount = 8) => {
    y -= amount;
  };

  // ===================== HEADER =====================

  drawCenteredText('NEW JERSEY REAL ESTATE PURCHASE AND SALE AGREEMENT', 14, fontBold);
  spacer(4);

  drawParagraph(
    `THIS AGREEMENT is made this ${fmtEffectiveDate(data.effectiveDate)} (the "Effective Date"), by and between:`,
    10,
  );
  spacer(6);

  drawLine('SELLER:', data.sellerName);
  drawLine('Address:', data.sellerAddress);
  spacer(6);

  drawLine('BUYER:', data.buyerName);
  drawLine('Address:', data.buyerAddress);
  spacer(8);

  drawHeading('1. THE PROPERTY.');
  drawParagraph(
    `Seller agrees to sell and Buyer agrees to buy the following property, together with all improvements and appurtenances (the "Property"):`,
  );
  drawLine('Street Address:', data.propertyAddress);
  drawLine(
    'Legal Description: Block',
    `${data.propertyBlock ?? ''}, Lot ${data.propertyLot ?? ''} (As recorded in county records)`,
  );
  spacer(8);

  drawHeading('2. PURCHASE PRICE.');
  drawParagraph(
    `The total purchase price to be paid by Buyer is ${fmtMoney(data.purchasePrice)}. Payment shall be made as follows:`,
  );
  drawLabeledParagraph(
    `(a) ${fmtMoney(data.emdAmount)} `,
    `as an Earnest Money Deposit (EMD) to be held in escrow by Buyer's Title Company within 3 business days of the conclusion of Attorney Review.`,
  );
  drawLabeledParagraph(
    `(b) ${fmtMoney(data.balanceAmount)} `,
    `Balance to be paid at Closing via Cash or Wire Transfer.`,
  );
  spacer(4);

  drawHeading('3. ATTORNEY REVIEW CLAUSE (REQUIRED).');
  drawLabeledParagraph(
    '1. Study by Attorney. ',
    `The Buyer or the Seller may choose to have an attorney study this Contract. If an attorney is consulted, the attorney must complete his or her review of the Contract within a three-day period. This Contract will be legally binding at the end of this three-day period unless an attorney for the Buyer or Seller reviews and disapproves of the Contract.`,
  );
  drawLabeledParagraph(
    '2. Counting the Time. ',
    `You count the three days from the date of delivery of the signed Contract to the Buyer and Seller. You do not count Saturdays, Sundays, or legal holidays.`,
  );
  drawLabeledParagraph(
    '3. Notice of Disapproval. ',
    `If an attorney for the Buyer or the Seller reviews and disapproves of this Contract, the attorney must notify the other party named in this Contract within the three-day period.`,
  );
  spacer(4);

  drawHeading('4. MANDATORY SELLER DISCLOSURE (NEW LAW 2024).');
  drawParagraph(
    `Seller acknowledges the requirement to provide Buyer with a fully completed Seller's Property Condition Disclosure Statement as mandated by New Jersey law (P.L.2024, c.32). Seller agrees to deliver this statement to Buyer prior to or upon signing this Agreement. Buyer reserves the right to cancel this Agreement within three (3) days of receipt if the condition is not satisfactory.`,
  );
  spacer(4);

  drawHeading('5. INVESTOR DISCLOSURE & ASSIGNMENT.');
  drawParagraph(
    `Buyer is a real estate investor. Seller acknowledges that Buyer intends to either purchase the Property, assign this Agreement to a third party for a profit, or resell the Property immediately after closing.`,
  );
  spacer(4);

  drawLabeledParagraph(
    'Assignment Right: ',
    `Buyer has the unqualified right to assign its rights under this Agreement to a third party.`,
  );
  drawLabeledParagraph(
    'Release of Liability: ',
    `Upon assignment, the original Buyer and/or Assigner (${data.buyerName.split(' and/or')[0]}) shall be released from any further liability or obligation under this Agreement.`,
  );
  spacer(4);

  drawHeading('6. "AS-IS" CONDITION & INSPECTION.');
  drawParagraph(
    `Buyer accepts the Property in its current "AS-IS" condition. Seller shall make no repairs.`,
  );
  drawLabeledParagraph(
    'Inspection Period: ',
    `Buyer shall have Fourteen (14) business days from the conclusion of Attorney Review to inspect the Property.`,
  );
  drawLabeledParagraph(
    'Right to Cancel: ',
    `Buyer may cancel this Agreement for any reason during the Inspection Period by providing written notice to Seller, upon which the Earnest Money Deposit shall be returned to Buyer in full.`,
  );

  drawHeading('7. CLOSING.');
  drawParagraph(
    `Closing shall occur on or before ${data.closingDays} days from the conclusion of Attorney Review. Closing shall be held at a Title Company selected by Buyer. All transfer taxes shall be paid by Seller. Buyer shall pay for title insurance and closing fees.`,
  );
  spacer(4);

  drawHeading('8. NO BROKER COMMISSIONS.');
  drawParagraph(
    `Both parties represent that they have not utilized the services of a real estate broker or agent in this transaction. Any undisclosed commissions are the sole responsibility of the party who contracted them.`,
  );
  spacer(4);

  drawHeading('9. ACCESS.');
  drawParagraph(
    `Seller agrees to provide Buyer, Buyer's partners, contractors, and potential assignees access to the Property during daylight hours for the purpose of inspection, marketing, and due diligence.`,
  );
  spacer(4);

  drawHeading('10. PLATFORM DISCLAIMER, NON-AGENCY, & LIMITATION OF LIABILITY.');
  drawParagraph(
    `This Section 10 is a material and conspicuous term of this Agreement, is incorporated into and made a part of this Agreement for all purposes, and shall survive the Closing, Attorney Review, assignment, cancellation, or termination of this Agreement.`,
  );
  drawLabeledParagraph(
    '(a) Technology Provider Status; TRACT Not a Party. ',
    `TRACT Inc. ("TRACT") is strictly a software-as-a-service (SaaS) technology platform and clearinghouse that made available the software used to generate this Agreement. TRACT IS NOT, AND SHALL NOT BE CONSTRUED TO BE, A BUYER, SELLER, ASSIGNEE, GUARANTOR, ESCROW AGENT, OR PARTY TO THIS AGREEMENT. TRACT holds no right, title, or interest in the Property, does not receive, hold, or disburse the Earnest Money Deposit, and has no obligation whatsoever to perform, enforce, guarantee, or otherwise ensure performance of any term of this Agreement by Buyer, Seller, any wholesaler, or any assignee.`,
  );
  drawLabeledParagraph(
    '(b) No Brokerage; No Agency; No Fiduciary Relationship. ',
    `TRACT is not a licensed real estate broker or salesperson in New York or New Jersey and does not act, and shall not be deemed to act, as a broker, agent, dual agent, transaction broker, or fiduciary for Buyer, Seller, any wholesaler, or any other platform user, and owes no fiduciary or other duty of care to any party in connection with this Agreement or the underlying transaction. No commission, referral fee, success fee, or other transaction-based compensation of any kind is owed to TRACT arising from the sale, purchase, or assignment of the Property. TRACT's sole compensation from its users is the recurring subscription fee paid under TRACT's separate Terms of Service, which is earned by TRACT irrespective of whether this Agreement closes, is assigned, is cancelled, or is terminated.`,
  );
  drawLabeledParagraph(
    '(c) No Legal Advice; Independent Counsel Encouraged. ',
    `This Agreement was generated using TRACT's automated template-generation software solely for the convenience of the parties. THIS DOCUMENT IS A TEMPLATE AND DOES NOT CONSTITUTE LEGAL ADVICE. Its generation, delivery, or use does not create, and shall not be construed to create, an attorney-client relationship between TRACT and Buyer, Seller, or any other party or user. TRACT does not review, revise, or verify the content of this Agreement for legal sufficiency, accuracy, or suitability to any particular transaction. BUYER AND SELLER ARE EACH STRONGLY ENCOURAGED TO RETAIN INDEPENDENT LICENSED COUNSEL IN NEW YORK OR NEW JERSEY, AS APPLICABLE, TO REVIEW THIS AGREEMENT BEFORE SIGNING, INCLUDING BY EXERCISING THE RIGHTS AFFORDED UNDER SECTION 3 (ATTORNEY REVIEW CLAUSE) ABOVE.`,
  );
  drawLabeledParagraph(
    '(d) Beta Platform; "As-Is" Software. ',
    `This Agreement was generated during TRACT's sixty (60)-day beta subscription period. THE TRACT PLATFORM, AND ALL SOFTWARE, TEMPLATES, AND OUTPUTS GENERATED BY IT, ARE PROVIDED STRICTLY "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, OR NON-INFRINGEMENT. TRACT DOES NOT WARRANT OR GUARANTEE UNINTERRUPTED, TIMELY, OR ERROR-FREE OPERATION OF THE PLATFORM DURING THE BETA PERIOD OR THEREAFTER.`,
  );
  drawLabeledParagraph(
    '(e) Limitation of Liability. ',
    `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE NEW YORK AND NEW JERSEY LAW, IN NO EVENT SHALL TRACT, OR ITS FOUNDERS, OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, OR AFFILIATES (COLLECTIVELY, THE "TRACT PARTIES"), BE LIABLE TO BUYER, SELLER, OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, LOSS OF BARGAIN, OR LOSS OF THE EARNEST MONEY DEPOSIT, ARISING OUT OF OR RELATING TO: (i) THE EXECUTION, PERFORMANCE, NONPERFORMANCE, BREACH, TERMINATION, OR ENFORCEMENT OF THIS AGREEMENT; (ii) THE FAILURE OF BUYER, SELLER, ANY WHOLESALER, OR ANY ASSIGNEE TO CLOSE; (iii) ANY DISPUTE OVER THE EARNEST MONEY DEPOSIT, INCLUDING ITS ESCROW, DISBURSEMENT, OR RETURN; OR (iv) ANY ERROR, OMISSION, OR AMBIGUITY IN THIS TEMPLATE, REGARDLESS OF WHETHER SUCH CLAIM IS BASED IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE, AND EVEN IF A TRACT PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN NO EVENT SHALL THE TRACT PARTIES' AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED THE TOTAL SUBSCRIPTION FEES ACTUALLY PAID BY THE CLAIMING PARTY TO TRACT DURING THE THREE (3) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.`,
  );
  drawLabeledParagraph(
    '(f) Indemnification; Hold Harmless. ',
    `BUYER AND SELLER EACH, JOINTLY AND SEVERALLY AS TO THEIR RESPECTIVE ACTS AND OMISSIONS, AGREE TO INDEMNIFY, DEFEND, AND HOLD HARMLESS THE TRACT PARTIES FROM AND AGAINST ANY AND ALL CLAIMS, DEMANDS, LOSSES, LIABILITIES, DAMAGES, JUDGMENTS, FINES, PENALTIES, COSTS, AND EXPENSES (INCLUDING REASONABLE ATTORNEYS' FEES) ARISING OUT OF OR RELATED TO: (i) THIS AGREEMENT, INCLUDING ITS NEGOTIATION, EXECUTION, PERFORMANCE, BREACH, OR TERMINATION; (ii) ANY FAILURE OF BUYER, SELLER, ANY WHOLESALER, OR ANY ASSIGNEE TO CLOSE OR OTHERWISE PERFORM; (iii) ANY DISPUTE BETWEEN BUYER AND SELLER, OR BETWEEN EITHER OF THEM AND ANY THIRD PARTY (INCLUDING ANY ASSIGNEE, TITLE COMPANY, OR ESCROW HOLDER), RELATING TO THE EARNEST MONEY DEPOSIT OR THE PROPERTY; AND (iv) ANY BREACH OF THE REPRESENTATIONS IN SECTION 8 (NO BROKER COMMISSIONS) OR OF ANY OTHER REPRESENTATION MADE BY BUYER OR SELLER IN THIS AGREEMENT. THIS INDEMNIFICATION OBLIGATION SURVIVES THE CLOSING, ASSIGNMENT, CANCELLATION, OR TERMINATION OF THIS AGREEMENT.`,
  );
  drawLabeledParagraph(
    '(g) Acknowledgment. ',
    `BY SIGNING BELOW, BUYER AND SELLER EACH ACKNOWLEDGE THAT THEY HAVE READ AND UNDERSTAND THIS SECTION 10 IN ITS ENTIRETY, THAT ITS TERMS ARE CONSPICUOUS AND MATERIAL TO THIS AGREEMENT, AND THAT THEY HAVE HAD A FULL AND FAIR OPPORTUNITY TO REVIEW THIS SECTION WITH INDEPENDENT COUNSEL PRIOR TO SIGNING.`,
  );
  spacer(20);

  drawSignatureLine('SELLER SIGNATURE:', '', 'Date:', '');
  drawSignatureLine('Print Name:', data.sellerName, '', '');
  spacer(10);

  drawSignatureLine('BUYER SIGNATURE:', '', 'Date:', '');
  drawSignatureLine('Entity Name:', '', '', '');
  drawSignatureLine('By:', '', '(Authorized Member)', '');
  drawSignatureLine('Date:', '', '', '');

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}