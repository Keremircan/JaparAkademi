-- =====================================================================
-- İş paketi 2.6c: toplu davet — denetim kaydı
-- =====================================================================

-- Toplu davet grubu (karar #201)
SELECT app_attach_audit('invitation_batches', '{id}');
--> statement-breakpoint

-- Davet: şifreli bağlantı da denetim kaydına maskeli yazılır (token/kod özetleriyle birlikte)
SELECT app_attach_audit('account_invitations', '{id}', '{token_hash,code_hash,link_enc}');
