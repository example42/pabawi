{{/*
Expand the name of the chart.
*/}}
{{- define "pabawi.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "pabawi.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by chart label.
*/}}
{{- define "pabawi.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "pabawi.labels" -}}
helm.sh/chart: {{ include "pabawi.chart" . }}
{{ include "pabawi.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/*
Selector labels.
*/}}
{{- define "pabawi.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pabawi.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Create the name of the service account to use.
*/}}
{{- define "pabawi.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "pabawi.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Secret name for chart-managed or user-supplied secret environment.
*/}}
{{- define "pabawi.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- include "pabawi.fullname" . -}}
{{- end -}}
{{- end -}}

{{/*
Bundled Bitnami PostgreSQL service name.
*/}}
{{- define "pabawi.postgresqlHost" -}}
{{- if .Values.database.postgres.host -}}
{{- .Values.database.postgres.host -}}
{{- else if .Values.postgresql.fullnameOverride -}}
{{- .Values.postgresql.fullnameOverride -}}
{{- else -}}
{{- printf "%s-postgresql" .Release.Name -}}
{{- end -}}
{{- end -}}

{{/*
Build DATABASE_URL for chart-managed secret data.
*/}}
{{- define "pabawi.databaseUrl" -}}
{{- $pg := .Values.database.postgres -}}
{{- if $pg.url -}}
{{- $pg.url -}}
{{- else -}}
{{- $host := include "pabawi.postgresqlHost" . -}}
{{- $username := $pg.username -}}
{{- $database := $pg.database -}}
{{- $password := $pg.password -}}
{{- if .Values.postgresql.enabled -}}
{{- $username = .Values.postgresql.auth.username -}}
{{- $database = .Values.postgresql.auth.database -}}
{{- end -}}
{{- if and .Values.postgresql.enabled (not $password) -}}
{{- $password = .Values.postgresql.auth.password -}}
{{- end -}}
{{- $suffix := "" -}}
{{- if $pg.sslMode -}}
{{- $suffix = printf "?sslmode=%s" $pg.sslMode -}}
{{- end -}}
{{- if $pg.parameters -}}
{{- if $suffix -}}
{{- $suffix = printf "%s&%s" $suffix $pg.parameters -}}
{{- else -}}
{{- $suffix = printf "?%s" $pg.parameters -}}
{{- end -}}
{{- end -}}
{{- printf "postgres://%s:%s@%s:%v/%s%s" $username $password $host (int $pg.port) $database $suffix -}}
{{- end -}}
{{- end -}}

{{/*
Render a named volume source from values.volumes.<name>.
*/}}
{{- define "pabawi.volumeSource" -}}
{{- $source := .source -}}
{{- if $source.existingClaim }}
persistentVolumeClaim:
  claimName: {{ $source.existingClaim | quote }}
{{- else if $source.configMap }}
configMap:
  name: {{ $source.configMap | quote }}
{{- else if $source.secret }}
secret:
  secretName: {{ $source.secret | quote }}
  {{- with $source.defaultMode }}
  defaultMode: {{ . }}
  {{- end }}
{{- else if $source.hostPath }}
hostPath:
  path: {{ $source.hostPath | quote }}
  type: {{ default "Directory" $source.hostPathType | quote }}
{{- else if $source.emptyDir }}
emptyDir:
{{ toYaml $source.emptyDir | indent 2 }}
{{- else }}
emptyDir: {}
{{- end }}
{{- end -}}
