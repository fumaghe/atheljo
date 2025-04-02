
if ( devopsLibrary.rescheduleWhenBranchIndexing() )
{
  return
}

def scmInfo = []
def branchName = ''

pipeline
{
  agent
  {
    node
    {
      label 'gcp-datascience-dh1'
    }
  }

  options
  {
    disableConcurrentBuilds()
    skipDefaultCheckout()
  }

  triggers
  {
    pollSCM( 'H/10 * * * *' )
  }

  stages
  {
    stage( 'Source checkout' )
    {
      steps
      {
        script
        {
          scmInfo = checkout scm
          echo "scm: ${scmInfo}"
          echo "${scmInfo.GIT_COMMIT}"

          if ( scmInfo?.GIT_LOCAL_BRANCH ) branchName = scmInfo.GIT_LOCAL_BRANCH
          else
          if ( scmInfo?.GIT_BRANCH ) branchName = scmInfo.GIT_BRANCH
        }
      }
    }

    stage( 'Clean environment before run' )
    {
      when
      {
        branch pattern: '^((main|master|qa|release)$|(qa|release)(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        script
        {
          devopsLibrary.stopContainers( 'avalon-' )
          devopsLibrary.removeUnusedDockerResources()
        }
      }
    }

    stage( 'Run static code tests in staging' )
    {
      when
      {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        sh '''
        [ -f Makefile.tests ] && make -f Makefile.tests all-static
        '''
      }
    }

    stage( 'Run containers for development' )
    {
      when
      {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        sh '''
        sudo docker compose -f docker-compose.yaml -p avalon --env-file ./.env-staging up -d
        '''
      }
    }

    stage( 'Run tests on running code in staging' )
    {
      when
      {
        branch pattern: '^((main|master|qa)$|qa(/|-).+)', comparator: "REGEXP"
      }
      steps
      {
        sh '''
        [ -f Makefile.tests ] && make -f Makefile.tests all-dynamic
        '''
      }
    }
  }

  post
  {
    always
    {
      script
      {
        devopsLibrary.wsCleanup( JOB_NAME, [ keepIndexingRuns : false, buildsToKeepThreshold : 15 ] )
      }
    }

    success
    {
      script
      {
        if ( branchName.matches( '^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)' ) )
        {
          devopsLibrary.discordSuccess()
        }
      }
    }

    failure
    {
      script
      {
        if ( branchName.matches( '^((main|master|qa|release)$|(nightly|qa|release)(/|-).+)' ) )
        {
          devopsLibrary.discordFailure(
            currentBuild.rawBuild.getLog( 500 ),
            [
              maxErrors : 2,
              maxExceptions : 0,
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
