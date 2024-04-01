import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";
import * as github from "@pulumi/github";
import * as flux from "@worawat/flux";
import { githubOwner } from ".";

const knownHosts =
  "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=";
const fluxNamespace = "flux-system";
export interface TenantResourceArgs {
  githubOwner: string;
  name: string;
  namespaces: { name: string }[];
  githubTeams?: { name: string }[];
}
export class TenantResource extends pulumi.ComponentResource {
  public readonly gitRepository: github.Repository;

  constructor(
    name: string,
    args: TenantResourceArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("flux:tenancy:Tenant", name, args, opts);

    const childResourceName = (key: string) => `${args.name}-${key}`;
    const childResourceOptions: pulumi.ComponentResourceOptions = {
      parent: this,
    };

    const repoName = childResourceName("workspace");

    // Generate ssh keys
    const key = new tls.PrivateKey(
      childResourceName("private-key"),
      {
        algorithm: "ECDSA",
        ecdsaCurve: "P256",
      },
      childResourceOptions
    );

    // Create Github repository
    this.gitRepository = new github.Repository(
      childResourceName("repository"),
      {
        name: repoName,
        visibility: "private",
        autoInit: true,
      },
      childResourceOptions
    );

    new github.RepositoryDeployKey(
      childResourceName("repository-deploy-key"),
      {
        title: "fluxcd",
        repository: this.gitRepository.name,
        key: key.publicKeyOpenssh,
        readOnly: false,
      },
      childResourceOptions
    );

    new github.BranchDefault(
      childResourceName("branch-default"),
      {
        repository: this.gitRepository.name,
        branch,
      },
      { ...childResourceOptions, dependsOn: this.gitRepository }
    );

    for (const githubTeam of args.githubTeams || []) {
      new github.TeamRepository(
        childResourceName(`team-repository-${githubTeam.name}`),
        {
          teamId: githubTeam.name,
          repository: this.gitRepository.name,
          permission: "push",
        },
        childResourceOptions
      );
    }

    const fluxSecretName = childResourceName("flux-secret");

    new k8s.core.v1.Secret(
      childResourceName("flux-secret"),
      {
        metadata: {
          name: fluxSecretName,
          namespace: fluxNamespace,
        },
        stringData: {
          identity: key.privateKeyPem,
          "identity.pub": key.publicKeyPem,
          known_hosts: knownHosts,
        },
      },
      childResourceOptions
    );

    for (const namespace of args.namespaces) {
      new k8s.core.v1.Namespace(
        childResourceName(`namespace-${namespace.name}`),
        {
          metadata: {
            name: namespace.name,
          },
        },
        childResourceOptions
      );

      // add admin role for github teams in namespace
      for (const githubTeam of args.githubTeams || []) {
        new k8s.rbac.v1.RoleBinding(
          childResourceName(
            `${namespace.name}-cluster-role-binding-${githubTeam.name}`
          ),
          {
            metadata: {
              name: `${githubTeam.name}-admin`,
              namespace: namespace.name,
            },
            roleRef: {
              apiGroup: "rbac.authorization.k8s.io",
              kind: "ClusterRole",
              name: "admin",
            },
            subjects: [
              {
                kind: "Group",
                name: githubTeam.name,
              },
            ],
          },
          childResourceOptions
        );
      }
    }

    // add ks and source
    flux
      .getFluxSync({
        name: childResourceName("automation"),
        targetPath: "clusters/my-cluster",
        url: `ssh://git@github.com/${githubOwner}/${repoName}.git`,
        branch: branch,
        secret: fluxSecretName,
      })
      .then((fluxSync) => {
        new k8s.yaml.ConfigGroup(
          childResourceName("flux-sync"),
          {
            yaml: fluxSync.content,
          },
          childResourceOptions
        );
      })
      .then(() => {
        this.registerOutputs();
      });
  }
}
const branch = "main";
const path = "kubernetes";
interface TenantSystemArgs {
  githubOwner: string;
}
export class TenantSystem extends pulumi.ComponentResource {
  public readonly gitRepository: github.Repository;

  constructor(
    name: string,
    args: TenantSystemArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("flux:tenancy:TenantSystem", name, args, opts);

    const childResourceOptions: pulumi.ComponentResourceOptions = {
      parent: this,
    };

    const repoName = "workspace-admin";
    const childResourceName = (key: string) => `${repoName}-${key}`;

    // Generate ssh keys
    const key = new tls.PrivateKey(
      childResourceName("private-key"),
      {
        algorithm: "ECDSA",
        ecdsaCurve: "P256",
      },
      childResourceOptions
    );

    // Create Github repository
    this.gitRepository = new github.Repository(
      childResourceName("repository"),
      {
        name: repoName,
        visibility: "private",
        autoInit: true,
      },
      childResourceOptions
    );

    new github.BranchDefault(
      childResourceName("branch-default"),
      {
        repository: this.gitRepository.name,
        branch,
      },
      childResourceOptions
    );

    // Add generated public key to Github deploy key
    const deployKey = new github.RepositoryDeployKey(
      childResourceName("repository-deploy-key"),
      {
        title: "fluxcd",
        repository: this.gitRepository.name,
        key: key.publicKeyOpenssh,
        readOnly: false,
      },
      childResourceOptions
    );

    const provider = new flux.Provider(
      "flux",
      {
        kubernetes: {
          configPath: "~/.kube/config",
        },
        git: {
          url: `ssh://git@github.com/${githubOwner}/${repoName}.git`,
          branch,
          ssh: {
            username: "git",
            privateKey: key.privateKeyPem,
          },
        },
      },
      childResourceOptions
    );

    new flux.FluxBootstrapGit(
      "flux",
      {
        path: path,
      },
      {
        ...childResourceOptions,
        provider: provider,
        dependsOn: deployKey,
      }
    );

    this.registerOutputs();
  }
}
