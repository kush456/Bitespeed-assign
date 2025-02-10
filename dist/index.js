"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use(express_1.default.json());
app.post("/identify", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { email, phoneNumber } = req.body;
        if (!email && !phoneNumber) {
            return res.status(400).json({ error: "Email or phone number is required" });
        }
        // Fetch contacts matching either email or phoneNumber
        const existingContacts = yield prisma.contact.findMany({
            where: {
                OR: [{ email }, { phoneNumber }],
            },
            orderBy: { createdAt: "asc" },
        });
        console.log(existingContacts);
        // Check if there exists at least one entry with the request's email and at least one entry with the request's phone number
        const emailExists = existingContacts.some(contact => contact.email === email);
        const phoneNumberExists = existingContacts.some(contact => contact.phoneNumber === phoneNumber);
        let newContact;
        if (!emailExists || !phoneNumberExists) {
            // Create a new primary contact
            newContact = yield prisma.contact.create({
                data: { email, phoneNumber, linkPrecedence: "primary" },
            });
            //if it is a completely new entry end code here only
            if (existingContacts.length === 0) {
                return res.json({
                    contact: {
                        primaryContactId: newContact.id,
                        emails: [newContact.email],
                        phoneNumbers: [newContact.phoneNumber],
                        secondaryContactIds: [],
                    },
                });
            }
        }
        // Identify the oldest primary contact
        let primaryContact = existingContacts.find(c => c.linkPrecedence === "primary");
        if (!primaryContact) {
            primaryContact = (_b = yield prisma.contact.findUnique({
                where: { id: (_a = existingContacts[0].linkedId) !== null && _a !== void 0 ? _a : undefined },
            })) !== null && _b !== void 0 ? _b : undefined;
        }
        let otherSecondaryContacts;
        const secondaryContacts = existingContacts.filter(c => primaryContact && c.id !== primaryContact.id);
        // Handle case where both email and phone number exist but belong to different primary entries
        if (emailExists && phoneNumberExists) {
            const emailContact = existingContacts.find(contact => contact.email === email);
            const phoneContact = existingContacts.find(contact => contact.phoneNumber === phoneNumber);
            if (emailContact && phoneContact && emailContact.id !== phoneContact.id) {
                const earliestPrimaryContact = emailContact.createdAt < phoneContact.createdAt ? emailContact : phoneContact;
                const otherPrimaryContact = earliestPrimaryContact === emailContact ? phoneContact : emailContact;
                // Update the other primary contact to be secondary
                yield prisma.contact.update({
                    where: { id: otherPrimaryContact.id },
                    data: { linkedId: earliestPrimaryContact.id, linkPrecedence: "secondary" },
                });
                // Find secondary contacts of the other primary contact
                otherSecondaryContacts = yield prisma.contact.findMany({
                    where: { linkedId: otherPrimaryContact.id },
                    orderBy: { createdAt: "asc" },
                });
                // Update all entries that were secondary to the other primary contact
                yield prisma.contact.updateMany({
                    where: { linkedId: otherPrimaryContact.id },
                    data: { linkedId: earliestPrimaryContact.id },
                });
                //primaryContact = earliestPrimaryContact;
                // Add other secondary contacts to all secondary contacts
                secondaryContacts.push(...otherSecondaryContacts);
            }
        }
        // Update secondary contacts to point to the primary contact
        for (const contact of secondaryContacts) {
            if (primaryContact && contact.linkPrecedence === "primary") {
                yield prisma.contact.update({
                    where: { id: contact.id },
                    data: { linkedId: primaryContact.id, linkPrecedence: "secondary" },
                });
            }
        }
        // If a new contact was created, update it to point to the primary contact
        if (newContact) {
            if (primaryContact) {
                yield prisma.contact.update({
                    where: { id: newContact.id },
                    data: { linkedId: primaryContact.id, linkPrecedence: "secondary" },
                });
            }
            secondaryContacts.push(newContact);
        }
        const allSecondaryContacts = yield prisma.contact.findMany({
            where: { linkedId: primaryContact === null || primaryContact === void 0 ? void 0 : primaryContact.id },
            orderBy: { createdAt: "asc" },
        });
        // Add other secondary contacts to all secondary contacts
        if (otherSecondaryContacts) {
            allSecondaryContacts.push(...otherSecondaryContacts);
        }
        // Collect emails and phone numbers
        const emails = new Set([primaryContact === null || primaryContact === void 0 ? void 0 : primaryContact.email, ...allSecondaryContacts.map(c => c.email)].filter(Boolean));
        const phoneNumbers = new Set([primaryContact === null || primaryContact === void 0 ? void 0 : primaryContact.phoneNumber, ...allSecondaryContacts.map(c => c.phoneNumber)].filter(Boolean));
        // Collect secondary contact ids
        const allSecondaryContactIds = allSecondaryContacts
            .filter(c => c.linkedId === (primaryContact === null || primaryContact === void 0 ? void 0 : primaryContact.id))
            .map(c => c.id);
        return res.json({
            contact: {
                primaryContactId: primaryContact ? primaryContact.id : null,
                emails: Array.from(emails),
                phoneNumbers: Array.from(phoneNumbers),
                secondaryContactIds: allSecondaryContactIds,
            },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}));
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
