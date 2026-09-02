import fs from "fs";
import path from "path";
import { jsPDF } from "jspdf";

const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 14;
const contentWidth = pageWidth - margin * 2;
let y = margin;

function checkPage(neededMm) {
  if (y + neededMm > pageHeight - margin - 10) {
    doc.addPage();
    y = margin;
    drawRunningHeader();
  }
}

function drawRunningHeader() {
  doc.setFillColor(247, 166, 0);
  doc.rect(margin, margin - 4, contentWidth, 0.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(43, 43, 43);
  doc.text("IIT PALAKKAD GUEST HOUSE PORTAL - SYSTEM INTEGRATION SPECIFICATION", margin, margin + 1);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 116, 110);
  doc.text("Email Notifications • College LDAP • Emergency Developer Access", pageWidth - margin, margin + 1, { align: "right" });
  y = margin + 8;
}

function addTitle(text) {
  checkPage(16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text(text, margin, y);
  y += 7;
}

function addSubtitle(text) {
  checkPage(8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(text, margin, y);
  y += 7;
}

function addSectionHeader(title) {
  checkPage(14);
  y += 3;
  doc.setFillColor(247, 166, 0);
  doc.rect(margin, y, contentWidth, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(40, 26, 0);
  doc.text(title.toUpperCase(), margin + 3, y + 4.2);
  y += 9;
}

function addSubSection(title) {
  checkPage(10);
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text(title, margin, y);
  y += 5.5;
}

function addParagraph(text) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const lines = doc.splitTextToSize(text, contentWidth);
  checkPage(lines.length * 4.2 + 2);
  doc.text(lines, margin, y);
  y += lines.length * 4.2 + 2;
}

function addBullet(bulletTitle, bulletText) {
  const fullText = `•  ${bulletTitle}: ${bulletText}`;
  const lines = doc.splitTextToSize(fullText, contentWidth - 4);
  checkPage(lines.length * 4.2 + 2);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(lines, margin + 2, y);
  
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`•  ${bulletTitle}:`, margin + 2, y);
  
  y += lines.length * 4.2 + 2;
}

function addCodeBlock(code) {
  const lines = code.trim().split("\n");
  const blockHeight = lines.length * 3.6 + 6;
  checkPage(blockHeight);
  
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, blockHeight, "FD");
  
  doc.setFont("courier", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(30, 41, 59);
  
  let codeY = y + 4.5;
  lines.forEach((line) => {
    doc.text(line, margin + 3, codeY);
    codeY += 3.6;
  });
  
  y += blockHeight + 3.5;
}

// ---------------- COVER / HEADER ----------------
doc.setFillColor(247, 166, 0);
doc.rect(margin, y, contentWidth, 2, "F");
y += 8;

addTitle("IIT Palakkad Guest House Portal");
addSubtitle("Complete Technical Specification & Implementation Guide for AI Agents");

addParagraph("This document contains exhaustive instructions, code blueprints, architecture flows, and recipient matrices to implement three major extensions into the IIT Palakkad Guest House Booking Portal: (1) Full-Lifecycle Email Notifications with BCC, (2) College LDAP Single Sign-On with Auto-Provisioning, and (3) Hidden Emergency Developer Override Access.");

// ---------------- SECTION 1: EMAIL NOTIFICATIONS ----------------
addSectionHeader("1. Full-Lifecycle Automated Email Notification System");

addParagraph("The portal handles multi-stage bookings for Bageshri & Hamsanandi guest houses. Email notifications ensure that Requesters, Reviewers (Warden/FA/IAR), GH Managers, and Institute Administration receive real-time notifications with appropriate CC and BCC headers.");

addSubSection("A. Recipient & Event Matrix");
addBullet("Booking Created", "To: Requester | CC: Assigned Reviewer (Warden/FA/IAR/GH Manager) | BCC: Admin Archive & Security Gate.");
addBullet("Reviewer Endorsement", "To: Requester (Updates with endorsement status) | CC: GH Manager | BCC: Admin Archive.");
addBullet("Manager Allocation", "To: Requester (Confirmation with Room Numbers & Check-in Details) | CC: Stage Reviewer & Reception | BCC: Admin.");
addBullet("Rejection (Any Stage)", "To: Requester (Includes mandatory reason & reviewer name) | CC: Stage Reviewer | BCC: Admin Archive.");
addBullet("Check-in (Occupied)", "To: Requester | CC: Reception & Billing | BCC: Admin Archive.");
addBullet("Check-out (Vacated)", "To: Requester | CC: Reception & Billing | BCC: Admin Archive.");
addBullet("Cancellation", "To: Requester | CC: GH Manager | BCC: Admin Archive.");

addSubSection("B. Implementation Blueprint");
addParagraph("1. Install Nodemailer: npm install nodemailer @types/nodemailer");
addParagraph("2. Configure environment variables in .env.local (supports Gmail App Passwords, Institute SMTP, or Resend API):");

addCodeBlock(
`SMTP_HOST=smtp.gmail.com  # or mail.iitpkd.ac.in\n` +
`SMTP_PORT=465\n` +
`SMTP_SECURE=true\n` +
`SMTP_USER=guesthouse-portal@iitpkd.ac.in\n` +
`SMTP_PASS=your-16-char-app-password\n` +
`SMTP_FROM="IIT Palakkad Guest House <guesthouse-portal@iitpkd.ac.in>"\n` +
`ADMIN_BCC_EMAILS=guesthouse@iitpkd.ac.in,developer@iitpkd.ac.in`
);

addParagraph("3. Create lib/email/index.ts with non-blocking try/catch dispatching and automatic BCC appending:");

addCodeBlock(
`import nodemailer from "nodemailer";\n` +
`const transporter = nodemailer.createTransport({\n` +
`  host: process.env.SMTP_HOST || "smtp.gmail.com",\n` +
`  port: Number(process.env.SMTP_PORT) || 465,\n` +
`  secure: process.env.SMTP_SECURE === "true",\n` +
`  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },\n` +
`});\n` +
`const DEFAULT_BCC = (process.env.ADMIN_BCC_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);\n` +
`export async function sendEmail({ to, cc, bcc, subject, html }) {\n` +
`  if (!process.env.SMTP_USER) { console.log("[MOCK EMAIL]", { to, subject }); return { ok: true }; }\n` +
`  try {\n` +
`    await transporter.sendMail({\n` +
`      from: process.env.SMTP_FROM,\n` +
`      to, cc,\n` +
`      bcc: [...(Array.isArray(bcc) ? bcc : bcc ? [bcc] : []), ...DEFAULT_BCC],\n` +
`      subject, html,\n` +
`    });\n` +
`    return { ok: true };\n` +
`  } catch (err) { console.error("[EMAIL ERROR]", err); return { ok: false, err }; }\n` +
`}`
);

// ---------------- SECTION 2: COLLEGE LDAP AUTHENTICATION ----------------
addSectionHeader("2. College LDAP Authentication & JIT User Provisioning");

addParagraph("Integrates IIT Palakkad's Central Authentication LDAP Server so students and staff can log in using roll numbers or institute emails, while automatically provisioning accounts and mapping roles.");

addSubSection("A. Authentication & Auto-Provisioning Workflow");
addBullet("Step 1 (Bind)", "Connect to ldaps://ldap.iitpkd.ac.in:636 and bind with user credentials (uid=username,ou=people,dc=iitpkd,dc=ac,dc=in).");
addBullet("Step 2 (Attributes)", "Extract user attributes: Full Name (cn), Email (mail), Department (department), and Organizational Unit.");
addBullet("Step 3 (JIT Provisioning)", "Query database for existing profile. If user exists, retain assigned roles (Warden, Manager, FA, IAR, Developer). If new user, create profile automatically: student if @smail domain / roll number format, employee otherwise.");
addBullet("Step 4 (Session)", "Set encrypted session cookie (gh_mock_user or JWT session) and route user to homeForRole(profile.role).");

addSubSection("B. Implementation Blueprint");
addParagraph("1. Install ldapts: npm install ldapts");
addParagraph("2. Configure environment variables in .env.local:");

addCodeBlock(
`LDAP_URL=ldaps://ldap.iitpkd.ac.in:636\n` +
`LDAP_BASE_DN=dc=iitpkd,dc=ac,dc=in`
);

addParagraph("3. Create lib/ldap.ts for LDAP authentication query:");

addCodeBlock(
`import { Client } from "ldapts";\n` +
`export async function authenticateLdap(username, password) {\n` +
`  const client = new Client({ url: process.env.LDAP_URL || "ldaps://ldap.iitpkd.ac.in:636", timeout: 5000 });\n` +
`  try {\n` +
`    const userDn = \`uid=\${username},ou=people,\${process.env.LDAP_BASE_DN}\`;\n` +
`    await client.bind(userDn, password);\n` +
`    const { searchEntries } = await client.search(process.env.LDAP_BASE_DN, { filter: \`(uid=\${username})\` });\n` +
`    const entry = searchEntries[0];\n` +
`    const email = entry?.mail || \`\${username}@iitpkd.ac.in\`;\n` +
`    const fullName = entry?.cn || username;\n` +
`    const isStudent = email.includes("@smail.") || /^\\d{6,}/.test(username);\n` +
`    return { ok: true, user: { username, email, fullName, userType: isStudent ? "student" : "employee" } };\n` +
`  } catch (err) { return { ok: false, error: "Invalid credentials" }; }\n` +
`  finally { await client.unbind().catch(() => {}); }\n` +
`}`
);

// ---------------- SECTION 3: EMERGENCY DEVELOPER OVERRIDE ----------------
addSectionHeader("3. Hidden Emergency Developer Override Access (Break-Glass)");

addParagraph("After handing over the project to college staff, developer personas should be hidden from standard login cards to prevent unauthorized tampering, while preserving a break-glass backdoor for system maintenance, room unblocking, or booking force-overrides.");

addSubSection("A. Architecture Options");
addBullet("Option 1 (Hidden URL)", "Dedicated secret path (/dev-access) protected by DEVELOPER_SECRET_KEY in server environment.");
addBullet("Option 2 (Easter Egg Trigger)", "5 consecutive clicks on the IIT Palakkad header emblem opens a secret authentication modal.");
addBullet("Option 3 (Whitelisted Emails)", "Configuring SUPERADMIN_EMAILS in .env.local automatically promotes specified institute emails to Developer role on LDAP login.");

addSubSection("B. Implementation Blueprint");
addCodeBlock(
`// app/actions/emergency-auth.ts\n` +
`"use server";\n` +
`import { cookies } from "next/headers";\n` +
`import { redirect } from "next/navigation";\n` +
`import { SESSION_COOKIE } from "@/lib/auth";\n` +
`import { getStore } from "@/lib/store";\n` +
`\n` +
`export async function emergencyDeveloperLogin(formData: FormData) {\n` +
`  const secret = formData.get("secretKey") as string;\n` +
`  if (secret !== process.env.DEVELOPER_SECRET_KEY) return { error: "Invalid master key" };\n` +
`  const store = getStore();\n` +
`  const profiles = await store.listProfiles();\n` +
`  let dev = profiles.find((p) => p.role === "developer");\n` +
`  if (!dev) {\n` +
`    dev = await store.createProfile({\n` +
`      email: "developer@iitpkd.ac.in", full_name: "Emergency Admin", role: "developer",\n` +
`      hostel_name: null, department_or_club: null, roll_number: null\n` +
`    });\n` +
`  }\n` +
`  const cookieStore = await cookies();\n` +
`  cookieStore.set(SESSION_COOKIE, dev.id, { httpOnly: true, sameSite: "lax", path: "/" });\n` +
`  redirect("/admin");\n` +
`}`
);

// ---------------- SECTION 4: AI PROMPT TEMPLATE ----------------
addSectionHeader("4. Direct Prompt for Other AI Coding Assistants");

addParagraph("Copy and paste the following prompt directly into Cursor, Claude, ChatGPT, or Gemini when you are ready to implement these features:");

addCodeBlock(
`"You are working on the IIT Palakkad Guest House Booking Portal (Next.js 16 App Router, TypeScript,\n` +
`Tailwind CSS, Supabase / MockStore). Please implement the following 3 features:\n` +
`\n` +
`1. EMAIL NOTIFICATIONS: Create lib/email/index.ts using nodemailer. Trigger non-blocking email updates\n` +
`   for booking creation, reviewer endorsements (Warden/FA/IAR), GH manager room allocation, check-in\n` +
`   (Occupied), check-out (Vacated), and rejections. Ensure all emails append ADMIN_BCC_EMAILS in BCC.\n` +
`\n` +
`2. COLLEGE LDAP AUTH: Install ldapts and create lib/ldap.ts. Add an LDAP login form in app/page.tsx.\n` +
`   Implement JIT profile creation in app/actions/auth.ts so new users are auto-created as student or\n` +
`   employee while existing roles (wardens, managers, developers) are preserved.\n` +
`\n` +
`3. BREAK-GLASS DEVELOPER ACCESS: Hide developer personas from the default login UI. Implement a secret\n` +
`   emergency access page at /dev-access and a 5-click logo trigger in the header, verified against\n` +
`   DEVELOPER_SECRET_KEY from .env.local to authenticate directly into /admin."`
);

// ---------------- FOOTER & PAGE NUMBERING ----------------
const totalPages = doc.getNumberOfPages();
for (let p = 1; p <= totalPages; p++) {
  doc.setPage(p);
  doc.setDrawColor(227, 225, 220);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 116, 110);
  doc.text("IIT Palakkad Guest House Management System - Integration Specification", margin, pageHeight - 5.5);
  doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 5.5, { align: "right" });
}

const outputPath = path.resolve(process.cwd(), "GUEST_HOUSE_FEATURE_SPEC_PROMPT.pdf");
const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
fs.writeFileSync(outputPath, pdfBuffer);
console.log("PDF generated successfully at:", outputPath);
