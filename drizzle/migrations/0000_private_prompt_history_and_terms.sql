CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80),
 preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE FUNCTION public.create_promptforge_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END; $$;
CREATE TRIGGER promptforge_profile_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_promptforge_profile();
CREATE TABLE public.consents (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 terms_version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own consent read" ON public.consents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own consent insert" ON public.consents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND terms_version = '2026-11-01');
CREATE POLICY "Own consent update" ON public.consents FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND terms_version = '2026-11-01');
CREATE TABLE public.prompt_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 idea text NOT NULL CHECK (char_length(idea) BETWEEN 1 AND 4000),
 prompt text NOT NULL DEFAULT '',
 language text NOT NULL CHECK (language IN ('en','ar','ckb','kmr')),
 style text NOT NULL CHECK (style IN ('professional','creative','simple','detailed')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','refused','failed','stopped')),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_requests TO authenticated;
GRANT ALL ON public.prompt_requests TO service_role;
ALTER TABLE public.prompt_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own request read" ON public.prompt_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own accepted request insert" ON public.prompt_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.consents c WHERE c.user_id = auth.uid() AND c.terms_version = '2026-11-01'));
CREATE POLICY "Own accepted request update" ON public.prompt_requests FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.consents c WHERE c.user_id = auth.uid() AND c.terms_version = '2026-11-01'));
CREATE POLICY "Own request delete" ON public.prompt_requests FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX prompt_requests_owner_created ON public.prompt_requests (user_id, created_at DESC);