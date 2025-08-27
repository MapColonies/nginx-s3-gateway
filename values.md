# nginx

![Version: 2.0.0](https://img.shields.io/badge/Version-2.0.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 2.0.0](https://img.shields.io/badge/AppVersion-2.0.0-informational?style=flat-square)

A Helm chart for nginx

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| additionalPodAnnotations | object | `{}` | Use this property in order to add custom annotations to the Pod |
| authorization.domain | string | `"example"` | Your authorization domain |
| authorization.enabled | bool | `true` | Use authroization mechanism |
| authorization.url | string | `"http://localhost:8181/v1/data/http/authz/decision"` | Authorization endpoint |
| backend.host | string | `"backend-service"` | Backend service name for proxy_pass |
| backend.port | int | `8080` | Backend service port |
| caKey | string | `"ca.crt"` | Key in the CA secret that contains the certificate data |
| caPath | string | `"/usr/local/share/ca-certificates"` | Path where the CA certificate will be mounted in the container |
| caSecretName | string | `""` | Name of the Kubernetes secret containing the CA certificate |
| cloudProvider | object | `{"dockerRegistryUrl":"my-registry-url","flavor":"openshift","imagePullSecretName":"imagepullsecret"}` | Specify the cloud provider where the chart is being deployed |
| cloudProvider.dockerRegistryUrl | string | `"my-registry-url"` | URL of the Docker registry to pull images from |
| cloudProvider.flavor | string | `"openshift"` | Specify the flavor of the deployment |
| cloudProvider.imagePullSecretName | string | `"imagepullsecret"` | Name of the Kubernetes secret containing the image pull credentials |
| enabled | bool | `true` | Enable or disable the deployment of this chart |
| environment | string | `"development"` | Specify the environment for this deployment |
| extraVolumeMounts | list | `[]` | List of extra volumeMounts that are added to the NGINX container |
| extraVolumes | list | `[]` | List of extra volumes that are added to the Deployment |
| fullnameOverride | string | `""` | String to fully override fullname template |
| global.cloudProvider | object | `{}` | Global cloud provider configuration. |
| global.environment | string | `""` | Global environment setting. |
| global.ingress.domain | string | `""` | Domain name for the ingress. |
| global.metrics | object | `{}` | Configuration for metrics collection. |
| global.tracing | object | `{}` | Configuration for distributed tracing. |
| image.repository | string | `"nginx"` | Docker image name |
| image.tag | string | `"latest"` | Docker image tag |
| imagePullPolicy | string | `"Always"` | Image pull policy for all containers in the deployment |
| ingress.additionalAnnotations | string | `nil` | Additional annotations for ingress |
| ingress.domain | string | `""` | Domain of ingress |
| ingress.enabled | bool | `false` | Expose NGINX as an Ingress |
| ingress.ingressClassName | string | `"nginx"` | Class name of ingress |
| ingress.ingressMapping[0] | object | `{"host":null,"path":"/","pathType":"Prefix"}` | Path of ingress |
| ingress.ingressMapping[0].host | string | `nil` | Host of ingress |
| ingress.ingressMapping[0].pathType | string | `"Prefix"` | Path Type of ingreaa |
| ingress.tls.enabled | bool | `false` | Use ingress over HTTPS |
| ingress.tls.secretName | string | `""` | Secret name of ingress that points to the relevant custom certificates |
| initialDelaySeconds | int | `60` | Initial delay in seconds before the readiness probe starts |
| nameOverride | string | `""` | String to partially override fullname template (will maintain the release name) |
| nginx.maxAge | string | `nil` | Maximum age of the cache in seconds (for the header: Access-Control-Max-Age) |
| nodePort | int | `30001` | Port to expose on each node for NodePort service type |
| opentelemetry.exporterPort | int | `4317` | OpenTelemetry Collector endpoint address exporterHost: "localhost" |
| opentelemetry.ratio | int | `10` | OpenTelemetry sampling ratio |
| opentelemetry.samplerMethod | string | `"AlwaysOff"` | OpenTelemetry sampling method |
| opentelemetry.serviceName | string | `"nginx"` | OpenTelemetry service name to be associated your NGINX application |
| port | int | `8080` | Port on which the application will listen |
| prometheusExporter.enabled | bool | `false` | Enable or disable the Prometheus exporter sidecar |
| prometheusExporter.image.pullPolicy | string | `"IfNotPresent"` | Image pull policy for the Prometheus exporter |
| prometheusExporter.image.repository | string | `"nginx/nginx-prometheus-exporter"` | Docker image name for the Prometheus exporter |
| prometheusExporter.image.tag | string | `"latest"` | Docker image tag for the Prometheus exporter |
| prometheusExporter.resources.enabled | bool | `true` | Enable or disable resource limits and requests |
| prometheusExporter.resources.value.limits.cpu | string | `"100m"` | CPU limit for the main container |
| prometheusExporter.resources.value.limits.memory | string | `"128Mi"` | Memory limit for the main container |
| prometheusExporter.resources.value.requests.cpu | string | `"100m"` | CPU request for the main container |
| prometheusExporter.resources.value.requests.memory | string | `"128Mi"` | Memory request for the main container |
| replicaCount | int | `1` | Number of replicas to deploy |
| resetOnConfigChange | bool | `true` | If true, triggers a rolling update when the configuration changes |
| resources.enabled | bool | `true` | Use custom resources |
| resources.value.limits.cpu | string | `"100m"` | Pod CPU limit |
| resources.value.limits.memory | string | `"128Mi"` | Pod memory limit |
| resources.value.requests.cpu | string | `"100m"` | Pod CPU request |
| resources.value.requests.memory | string | `"128Mi"` | Pod memory request |
| route.enabled | bool | `true` | Expose NGINX as an Openshift route |
| route.rewriteTarget | string | `""` | Rewrite route target |
| route.routesMapping[0] | object | `{"host":null,"path":"/"}` | Path of route |
| route.routesMapping[0].host | string | `nil` | Host of route |
| route.timeout.duration | string | `"60s"` | Set the timeout duration of the route. Defaults to 30s by Openshift |
| route.timeout.enabled | bool | `false` | Use custom timeout duration of the route |
| route.tls.caCertificate | string | `""` | Set the CA certificate of the route |
| route.tls.certificate | string | `""` | Set the certificate of the route |
| route.tls.enabled | bool | `true` | Use route over HTTPS |
| route.tls.insecureEdgeTerminationPolicy | string | `"Redirect"` | Policy for traffic on insecure schemes like HTTP |
| route.tls.key | string | `""` | Set the key of the route |
| route.tls.termination | string | `"edge"` | Set the termination of the route |
| route.tls.useCerts | bool | `false` | Use custom certificates for the route |
| sidecars | string | `""` | String consists of a list of sidecars containers that are added to the Deployment |
| siteStatusPort | int | `8081` | Port on which the site status will be available |
| targetPort | int | `8080` | Port to which the service will forward traffic |

