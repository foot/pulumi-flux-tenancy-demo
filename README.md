# README.md

> [!WARNING]
> This repository is a Proof Of Concept / Exploration / Demo and should not be used in production without further development and testing. It is intended to demonstrate a simple GitOps tenancy system using Pulumi with GitHub and Kubernetes. This is more about exploring the concept and the possibilities.
>
> E.g. Flux has not been configured properly yet to use a tenant `ServiceAccount` for applying resources etc. There are probably many other security issues too.

## Overview

This repository contains a POC for a simple GitOps tenancy system designed around Flux for Kubernetes. The system leverages Pulumi for declarative infrastructure as code, enabling easy setup and management of tenant-specific resources, such as GitHub repositories and Kubernetes namespaces, while also ensuring access controls via GitHub teams and Kubernetes RBAC.

The primary goal is to streamline the process of setting up isolated environments for different tenants in a Kubernetes cluster, with everything as code - from GitHub repositories to namespace configurations and access controls.

## Features

- **Tenant-Based GitHub Repositories**: Automatically creates a GitHub repository for each tenant, which is intended to store the Kubernetes manifests for that tenant's namespaces.
- **Namespace Management**: For each tenant, the specified Kubernetes namespaces are managed and connected to the tenant's GitHub repository via Flux, ensuring that the cluster state matches the configuration defined in Git.
- **Access Control**: Configures GitHub and Kubernetes RBAC to restrict access to resources based on the tenant's teams, allowing for secure, multi-tenant environments.
- **Declarative Configuration**: Utilizes Pulumi's declarative infrastructure as code approach for managing both the Kubernetes cluster and GitHub resources, enabling easy and predictable deployments.

## Configuration

This system is configured through Pulumi's configuration system, allowing for easy setup and adjustments without having to modify the codebase directly. Below are the steps to configure and deploy the GitOps tenancy system.

### Prerequisites

- A Kubernetes cluster (e.g. `kind` for testing this out locally)
- Pulumi CLI installed
- A GitHub account and a personal access token with necessary permissions (to create repositories, manage teams, etc.)

### Step 1: Configure Pulumi to Use Your Stack

Choose or create a Pulumi stack to work with:

```shell
pulumi stack init $stack_name
```

Replace `$stack_name` with your desired stack name.

### Step 2: Set Configuration Values

You will need to set configuration values for the GitHub owner and tenants. Use the Pulumi configuration system as follows:

Set the GitHub owner:

```shell
pulumi config set github:owner $your_github_owner
```

Replace `$your_github_owner` with the GitHub username or organization name under which repositories will be created.

Provide tenant configurations by directly editing `Pulumi.$stack_name.yaml`:

```yaml
config:
  github:owner: $your_github_owner
  tenancy:tenants:
    - name: ai-team
      namespaces:
        - name: ai
        - name: observability
        - name: logging
      githubTeams:
        - name: ai-team
        - name: billing-team
```

### Step 3: Deploy

With the configuration set, you are ready to deploy the tenancy system:

```shell
pulumi up
```

This command will review the deployment plan based on your configurations and prompt for confirmation before making any changes.

### Will look something like this!

```
TYPE                                                              NAME
pulumi:pulumi:Stack                                               tenancy-dev
├─ flux:tenancy:TenantSystem                                      acme-corp-tenants
│  ├─ github:index/repository:Repository                          workspace-admin-repository
│  ├─ tls:index/privateKey:PrivateKey                             workspace-admin-private-key
│  ├─ github:index/branchDefault:BranchDefault                    workspace-admin-branch-default
│  ├─ pulumi:providers:flux                                       flux
│  ├─ github:index/repositoryDeployKey:RepositoryDeployKey        workspace-admin-repository-deploy-key
│  └─ flux:index/fluxBootstrapGit:FluxBootstrapGit                flux
├─ flux:tenancy:Tenant                                            ai-team
│  ├─ kubernetes:yaml:ConfigGroup                                 ai-team-flux-sync
│  │  ├─ kubernetes:kustomize.toolkit.fluxcd.io/v1:Kustomization  flux-system/ai-team-automation
│  │  └─ kubernetes:source.toolkit.fluxcd.io/v1:GitRepository     flux-system/ai-team-automation
│  ├─ tls:index/privateKey:PrivateKey                             ai-team-private-key
│  ├─ github:index/repository:Repository                          ai-team-repository
│  ├─ kubernetes:core/v1:Namespace                                ai-team-namespace-ai
│  ├─ kubernetes:core/v1:Namespace                                ai-team-namespace-logging
│  ├─ kubernetes:core/v1:Namespace                                ai-team-namespace-observability
│  ├─ kubernetes:core/v1:Secret                                   ai-team-flux-secret
│  ├─ github:index/teamRepository:TeamRepository                  ai-team-team-repository-billing-team
│  ├─ github:index/teamRepository:TeamRepository                  ai-team-team-repository-ai-team
│  ├─ github:index/repositoryDeployKey:RepositoryDeployKey        ai-team-repository-deploy-key
│  ├─ github:index/branchDefault:BranchDefault                    ai-team-branch-default
│  ├─ kubernetes:rbac.authorization.k8s.io/v1:RoleBinding         ai-team-ai-cluster-role-binding-billing-team
│  ├─ kubernetes:rbac.authorization.k8s.io/v1:RoleBinding         ai-team-ai-cluster-role-binding-ai-team
│  ├─ kubernetes:rbac.authorization.k8s.io/v1:RoleBinding         ai-team-observability-cluster-role-binding-ai-team
│  ├─ kubernetes:rbac.authorization.k8s.io/v1:RoleBinding         ai-team-logging-cluster-role-binding-ai-team
│  ├─ kubernetes:rbac.authorization.k8s.io/v1:RoleBinding         ai-team-logging-cluster-role-binding-billing-team
│  └─ kubernetes:rbac.authorization.k8s.io/v1:RoleBinding         ai-team-observability-cluster-role-binding-billing-team
├─ pulumi:providers:flux                                          default_1_0_1
├─ pulumi:providers:github                                        default_6_2_0
├─ pulumi:providers:tls                                           default_5_0_1
└─ pulumi:providers:kubernetes                                    default_4_9_1
```

## Cleanup

To remove the deployed resources, run:

```shell
pulumi destroy
```

And follow the prompt to confirm the destruction of the resources.
