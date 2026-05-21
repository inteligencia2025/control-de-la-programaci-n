CREATE OR REPLACE FUNCTION public.add_project_contractor(_project_id uuid, _contractor text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text := btrim(coalesce(_contractor, ''));
  _result text[];
BEGIN
  IF _name = '' THEN
    SELECT contractors INTO _result
    FROM public.projects
    WHERE id = _project_id
      AND deleted_at IS NULL
      AND (
        user_id = auth.uid()
        OR public.is_assigned_to_project(auth.uid(), id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      );
    RETURN coalesce(_result, '{}'::text[]);
  END IF;

  UPDATE public.projects
  SET contractors = CASE
      WHEN _name = ANY(contractors) THEN contractors
      ELSE array_append(contractors, _name)
    END,
    updated_at = now()
  WHERE id = _project_id
    AND deleted_at IS NULL
    AND (
      user_id = auth.uid()
      OR public.is_assigned_to_project(auth.uid(), id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  RETURNING contractors INTO _result;

  IF _result IS NULL THEN
    RAISE EXCEPTION 'not authorized or project not found';
  END IF;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_project_custom_failure_cause(_project_id uuid, _cause text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text := btrim(coalesce(_cause, ''));
  _result text[];
BEGIN
  IF _name = '' THEN
    SELECT custom_failure_causes INTO _result
    FROM public.projects
    WHERE id = _project_id
      AND deleted_at IS NULL
      AND (
        user_id = auth.uid()
        OR public.is_assigned_to_project(auth.uid(), id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      );
    RETURN coalesce(_result, '{}'::text[]);
  END IF;

  UPDATE public.projects
  SET custom_failure_causes = CASE
      WHEN _name = ANY(custom_failure_causes) THEN custom_failure_causes
      ELSE array_append(custom_failure_causes, _name)
    END,
    updated_at = now()
  WHERE id = _project_id
    AND deleted_at IS NULL
    AND (
      user_id = auth.uid()
      OR public.is_assigned_to_project(auth.uid(), id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  RETURNING custom_failure_causes INTO _result;

  IF _result IS NULL THEN
    RAISE EXCEPTION 'not authorized or project not found';
  END IF;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.add_project_contractor(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_project_custom_failure_cause(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_project_contractor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_project_custom_failure_cause(uuid, text) TO authenticated;