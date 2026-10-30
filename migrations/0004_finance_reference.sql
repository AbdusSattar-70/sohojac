-- Genuine accounting reference accounts only; NO invoices/payments/students or marketing examples.
INSERT INTO finance_accounts(id,code,name,kind) VALUES ('sohoj-asset-cash','1000','Cash on hand','ASSET');
INSERT INTO finance_accounts(id,code,name,kind) VALUES ('sohoj-asset-bank','1010','Bank deposits','ASSET');
INSERT INTO finance_accounts(id,code,name,kind) VALUES ('sohoj-asset-mfs','1020','Mobile financial services','ASSET');
INSERT INTO finance_accounts(id,code,name,kind) VALUES ('sohoj-asset-ar','1100','Student receivables','ASSET');
INSERT INTO finance_accounts(id,code,name,kind) VALUES ('sohoj-liab-deferred','2200','Deferred tuition and admission fees','LIABILITY');
INSERT INTO finance_accounts(id,code,name,kind) VALUES ('sohoj-expense-operating','5100','Operating expenses','EXPENSE');
