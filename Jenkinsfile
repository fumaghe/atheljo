if ( devopsLibrary.rescheduleWhenBranchIndexing() ) {
  return
}

def scmInfo = []
def branchName = ''
// Variabile globale per decidere se procedere o meno con la build
def shouldBuild = true

pipeline {
  agent {
    node {
      label 'dh3'
      customWorkspace "/mnt/engnfs/jenkins/workspace/${JOB_NAME}/${BUILD_NUMBER}"
    }
  }

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout()
  }

  triggers {
    pollSCM('H/10 * * * *')
  }

  stages {

    stage('Source checkout') {
      steps {
        script {
          scmInfo = checkout scm
          echo "scm: ${scmInfo}"
          echo "Commit: ${scmInfo.GIT_COMMIT}"
          if ( scmInfo?.GIT_LOCAL_BRANCH ) {
            branchName = scmInfo.GIT_LOCAL_BRANCH
          } else if ( scmInfo?.GIT_BRANCH ) {
            branchName = scmInfo.GIT_BRANCH
          }
        }
      }
    }

    // Nuova fase per controllare se il commit corrente è diverso da quello precedente
    stage('Check for Changes') {
      steps {
        script {
          def commitFile = "${env.WORKSPACE}/previousCommit.txt"
          def previousCommit = ''
          if (fileExists(commitFile)) {
            previousCommit = readFile(commitFile).trim()
          }
          if (previousCommit == scmInfo.GIT_COMMIT) {
            echo "Nessuna modifica rilevata. Commit corrente ${scmInfo.GIT_COMMIT} è uguale al precedente."
            shouldBuild = false
          } else {
            echo "Nuovo commit rilevato: ${scmInfo.GIT_COMMIT} (precedente: ${previousCommit}). Procedo con la build."
            // Salva il nuovo commit per confronti futuri
            writeFile(file: commitFile, text: scmInfo.GIT_COMMIT)
            shouldBuild = true
          }
        }
      }
    }

    stage('Clean environment before run') {
      when {
        allOf {
          branch pattern: '^((main|master|qa|release)$|(qa|release)(/|-).+)', comparator: "REGEXP"
          expression { shouldBuild }
        }
      }
      steps {
        script {
          devopsLibrary.stopContainers('avalon-')
          devopsLibrary.removeUnusedDockerResources()
        }
      }
    }

    stage('Run static code tests in staging') {
      when {
        allOf {
          branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
          expression { shouldBuild }
        }
      }
      steps {
        sh '''
          [ ! -f Makefile.tests ] || make -f Makefile.tests all-static
        '''
      }
    }

    stage('Run containers for development') {
      when {
        allOf {
          branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
          expression { shouldBuild }
        }
      }
      steps {
        withCredentials([
          file(credentialsId: 'BACKEND_ENV_SECRET', variable: 'BACKEND_ENV_PATH'),
          file(credentialsId: 'ARCHIMEDES_ENV_SECRET', variable: 'ARCHIMEDES_ENV_PATH'),
          file(credentialsId: 'FIRESTORE_CREDENTIALS_FILE', variable: 'FIRESTORE_CREDENTIALS_PATH')
        ]) {
          sh '''
            # Leggi il contenuto dei file dei secret per BACKEND e ARCHIMEDES
            export BACKEND_ENV="$(cat "$BACKEND_ENV_PATH")"
            # Codifica in Base64 in formato one-line per preservare le newline
            export ARCHIMEDES_ENV_B64="$(base64 -w 0 "$ARCHIMEDES_ENV_PATH")"
            
            # Estrai EMAIL_PASSWORD e EMAIL_USER dal file dei secret
            export EMAIL_PASSWORD="$(grep '^EMAIL_PASSWORD=' "$BACKEND_ENV_PATH" | cut -d'=' -f2-)"
            export EMAIL_USER="$(grep '^DEFAULT_ADMIN_EMAIL=' "$BACKEND_ENV_PATH" | cut -d'=' -f2-)"
            
            # Debug: stampa la prima parte di ARCHIMEDES_ENV_B64
            echo "DEBUG: ARCHIMEDES_ENV_B64=$(echo "$ARCHIMEDES_ENV_B64" | head -n 1)"
            
            # Crea la cartella per i segreti se non esiste e copia il file di Firestore
            mkdir -p secrets
            cp "$FIRESTORE_CREDENTIALS_PATH" secrets/credentials.json
            
            # Scrive un file env.tmp per Docker Compose con le variabili
            printf "BACKEND_ENV=%s\nARCHIMEDES_ENV_B64=%s\nEMAIL_PASSWORD=%s\nEMAIL_USER=%s\n" "$BACKEND_ENV" "$ARCHIMEDES_ENV_B64" "$EMAIL_PASSWORD" "$EMAIL_USER" > env.tmp
            
            # Esegue il build per aggiornare solo i servizi modificati
            sudo docker compose -p avalon -f docker-compose.prod.yaml --env-file env.tmp build
            
            # Avvia i container senza forzare la ricreazione, così aggiornando solo quanto nuovo
            sudo docker compose -p avalon -f docker-compose.prod.yaml --env-file env.tmp up -d
          '''
        }
      }
    }

    stage('Run tests on running code in staging') {
      when {
        allOf {
          branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
          expression { shouldBuild }
        }
      }
      steps {
        sh '''
          [ ! -f Makefile.tests ] || make -f Makefile.tests all-dynamic
        '''
      }
    }
  }

  post {
    always {
      script {
        devopsLibrary.wsCleanup(JOB_NAME, [ keepIndexingRuns: false, buildsToKeepThreshold: 15 ])
      }
    }
    success {
      script {
        if ( branchName.matches('^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)') ) {
          devopsLibrary.discordSuccess()
        }
      }
    }
    failure {
      script {
        if ( branchName.matches('^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)') ) {
          devopsLibrary.discordFailure(
            currentBuild.rawBuild.getLog(500),
            [
              maxErrors: 2,
              maxExceptions: 0,
              maxWarnings: 0,
              contextBefore: 0,
              contextAfter: 4
            ]
          )
        }
      }
    }
  }
}
