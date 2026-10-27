-- İş paketi 1.8b: rapor dışa aktarma kaydı (denetim, yalnızca eklenir)
SELECT app_attach_audit('report_exports', '{id}');
--> statement-breakpoint
SELECT app_attach_immutable('report_exports');
